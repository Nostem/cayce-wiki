import { readingLabel } from "./identity"

/** Build-time catalog model. Never import corpus data into a browser bundle. */
export interface CatalogSource {
  slug?: string
  frontmatter?: Record<string, unknown>
  dates?: unknown
}
export type CatalogAssociation = "literal" | "semantic" | "name-only"
export interface CatalogRecord {
  slug: string
  label: string
  kind: string
  date?: string
  year?: string
  context?: string
  summary?: string
  count?: number
  literalCount?: number
  semanticCount?: number
  /** Detected from source preamble, e.g. Physical / Life / Dream. */
  readingType?: string
  /**
   * On entity topic lists: literal (named in reading entities), semantic/indexed, or
   * name-only (the only in-text links were given-name mislinks such as "Dr. Mary Miller").
   */
  association?: CatalogAssociation
}
export type CatalogSort = "id" | "date" | "count"
export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) || a.localeCompare(b)
const text = (value: unknown) => (typeof value === "string" ? value : undefined)
const countOf = (value: unknown) => (typeof value === "number" ? value : undefined)

/** Source-backed reading type label from the archival preamble (not LLM). */
const READING_TYPE_PATTERNS: [RegExp, string][] = [
  [/\(\s*Check\s+Physical[^)]*\)/i, "Physical"],
  [/\(\s*Physical\s+Suggestion\s*\)/i, "Physical"],
  [/\(\s*Physical\s+Reading(?:\s+Suggestion)?\s*\)/i, "Physical"],
  // The export usually writes "(Life Reading Suggestion)"; "(Life Reading)" is rare.
  [/\(\s*Life\s+Reading(?:\s+Suggestion)?\s*\)/i, "Life"],
  [/\(\s*Business\s+Reading(?:\s+Suggestion)?\s*\)/i, "Business"],
  [/\(\s*Dream\s+Reading(?:\s+Suggestion)?\s*\)/i, "Dream"],
  [/\(\s*Mental[-\s]?Spiritual[^)]*\)/i, "Mental-Spiritual"],
  [/\(\s*Aura\s+Chart[^)]*\)/i, "Aura"],
]

export function detectReadingType(source: string): string | undefined {
  const textSection = source.split(/\n##\s+Reports\b|\n##\s+Background\b/)[0] ?? source
  for (const [pattern, label] of READING_TYPE_PATTERNS) {
    if (pattern.test(textSection)) return label
  }
  return undefined
}

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
    count: countOf(fm.reading_count),
    literalCount: countOf(fm.literal_reading_count),
    semanticCount: countOf(fm.semantic_reading_count),
    readingType: kind === "readings" ? detectReadingType(raw) : undefined,
  }
}
const ASSOCIATION_RANK: Record<CatalogAssociation, number> = {
  literal: 0,
  semantic: 1,
  "name-only": 2,
}
export function compareCatalog(sort: CatalogSort) {
  return (a: CatalogRecord, b: CatalogRecord) => {
    // Strong (literal) associations first, then indexed/semantic, then name-only mislinks.
    if (a.association && b.association && a.association !== b.association) {
      return ASSOCIATION_RANK[a.association] - ASSOCIATION_RANK[b.association]
    }
    if (sort === "count") {
      const ac = a.count ?? -1
      const bc = b.count ?? -1
      if (ac !== bc) return bc - ac
      return naturalCompare(a.label, b.label) || naturalCompare(a.slug, b.slug)
    }
    if (sort === "date" && a.date !== b.date) {
      if (!a.date) return 1
      if (!b.date) return -1
      return a.date.localeCompare(b.date)
    }
    return naturalCompare(a.label, b.label) || naturalCompare(a.slug, b.slug)
  }
}
/** Default sort for a collection base: entities prefer popularity. */
export function defaultCatalogSort(base: string): CatalogSort {
  return base === "entities" || base.startsWith("catalog/entity-types/") ? "count" : "id"
}
export function pageSlug(
  base: string,
  page: number,
  sort: CatalogSort = "id",
  preferred: CatalogSort = "id",
) {
  if (sort === "date") return `${base}/by-date/page/${page}`
  if (sort === preferred) return page === 1 ? base : `${base}/page/${page}`
  if (sort === "count") return page === 1 ? `${base}/by-count` : `${base}/by-count/page/${page}`
  return page === 1 ? `${base}/by-name` : `${base}/by-name/page/${page}`
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

/** Case number for a reading id such as 294-12 → "294". */
export function readingCaseId(reading: string): string | undefined {
  const match = reading.match(/^(.+)-(\d+)$/)
  return match ? match[1] : undefined
}

/** True when this is the first reading in a case (e.g. 1527-1). */
export function isCaseOpening(reading: string): boolean {
  return /^(.+)-1$/.test(reading) && !reading.includes("_")
}

/** Stable slug for a reading-type catalog filter. */
export function readingTypeSlug(type: string): string {
  return type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
