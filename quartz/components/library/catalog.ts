import { readingLabel } from "./identity"

/** Build-time catalog model. Never import corpus data into a browser bundle. */
export interface CatalogSource {
  slug?: string
  frontmatter?: Record<string, unknown>
  dates?: unknown
}
export interface CatalogRecord {
  slug: string
  label: string
  kind: string
  date?: string
  year?: string
  context?: string
  summary?: string
  count?: number
}
export type CatalogSort = "id" | "date"
export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) || a.localeCompare(b)
const text = (value: unknown) => (typeof value === "string" ? value : undefined)

export function originalDate(source: string): string | undefined {
  const header = source.split(/\n\s*1\.\s/)[0]
  if (
    /(?:exact date[^.\n]{0,90}unknown|date[^.\n]{0,90}(?:approximat|uncertain|estimated))/i.test(
      header,
    )
  )
    return undefined
  const match = source.match(/^Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?=\s|$)/m)
  if (!match) return undefined
  const [, month, day, year] = match
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : undefined
}
export function catalogRecord(source: CatalogSource, raw = ""): CatalogRecord {
  const fm = source.frontmatter ?? {}
  const slug = source.slug ?? ""
  const kind = slug.split("/")[0]
  const label =
    text(fm.entity) ?? text(fm.reading) ?? text(fm.title) ?? slug.split("/").pop() ?? slug
  return {
    slug,
    label: kind === "readings" ? readingLabel(label, slug) : label,
    kind,
    date: originalDate(raw),
    year: typeof fm.year === "number" || typeof fm.year === "string" ? String(fm.year) : undefined,
    context:
      text(fm.series_title) ??
      (Array.isArray(fm.entity_types) ? fm.entity_types.join(", ") : undefined),
    summary: text(fm.summary),
    count: typeof fm.reading_count === "number" ? fm.reading_count : undefined,
  }
}
export function compareCatalog(sort: CatalogSort) {
  return (a: CatalogRecord, b: CatalogRecord) => {
    if (sort === "date" && a.date !== b.date) {
      if (!a.date) return 1
      if (!b.date) return -1
      return a.date.localeCompare(b.date)
    }
    return naturalCompare(a.label, b.label) || naturalCompare(a.slug, b.slug)
  }
}
export function paginate<T>(rows: readonly T[], page = 1, size = 40) {
  if (!Number.isInteger(size) || size < 25 || size > 50)
    throw new Error("Catalog page size must be 25–50")
  const pages = Math.max(1, Math.ceil(rows.length / size))
  if (!Number.isInteger(page) || page < 1 || page > pages) throw new Error("Invalid catalog page")
  const start = (page - 1) * size
  return {
    rows: rows.slice(start, start + size),
    page,
    pages,
    total: rows.length,
    start: rows.length ? start + 1 : 0,
    end: Math.min(start + size, rows.length),
  }
}
export function verifyMembership(
  label: string,
  members: Iterable<string>,
  expected: number,
  available: ReadonlySet<string>,
): string[] {
  const unique = [...new Set(members)]
  const missing = unique.filter((id) => !available.has(id))
  if (missing.length) throw new Error(`${label}: missing reading targets: ${missing.join(", ")}`)
  if (unique.length !== expected)
    throw new Error(
      `${label}: membership mismatch: expected ${expected}, recovered ${unique.length}`,
    )
  return unique.sort(naturalCompare)
}
