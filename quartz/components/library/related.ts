import { naturalCompare } from "./catalog"

export interface RelatedReading {
  id: string
  slug: string
  score: number
  shared: string[]
}

export interface RelatedFileLike {
  slug?: string
  frontmatter?: Record<string, unknown>
}

/** Cap shared-topic scoring so popular hubs (Atlantis) do not dominate every page. */
const MAX_ENTITIES_PER_READING = 12
const MIN_SHARED = 2
const MAX_RELATED = 6

let cacheKey = ""
let relatedByReading = new Map<string, RelatedReading[]>()

function entityNames(fm: Record<string, unknown> | undefined): string[] {
  if (!fm || !Array.isArray(fm.entities)) return []
  return fm.entities
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
}

/**
 * Build once per allFiles snapshot. Prefer readings that share multiple named
 * entities (frontmatter `entities`), not synopsis/graph edges.
 */
export function relatedReadingsFor(
  readingId: string,
  allFiles: readonly RelatedFileLike[],
  limit = MAX_RELATED,
): RelatedReading[] {
  if (cacheKey !== `${allFiles.length}`) {
    cacheKey = `${allFiles.length}`
    relatedByReading = buildRelatedIndex(allFiles)
  }
  return (relatedByReading.get(readingId) ?? []).slice(0, limit)
}

function buildRelatedIndex(allFiles: readonly RelatedFileLike[]): Map<string, RelatedReading[]> {
  const readingEntities = new Map<string, string[]>()
  const entityToReadings = new Map<string, string[]>()

  for (const file of allFiles) {
    const slug = file.slug
    if (!slug?.startsWith("readings/")) continue
    const id = typeof file.frontmatter?.reading === "string" ? file.frontmatter.reading : undefined
    if (!id) continue
    const entities = entityNames(file.frontmatter).slice(0, MAX_ENTITIES_PER_READING)
    if (!entities.length) continue
    readingEntities.set(id, entities)
    for (const entity of entities) {
      const list = entityToReadings.get(entity) ?? []
      list.push(id)
      entityToReadings.set(entity, list)
    }
  }

  const result = new Map<string, RelatedReading[]>()
  for (const [id, entities] of readingEntities) {
    const scores = new Map<string, { score: number; shared: Set<string> }>()
    for (const entity of entities) {
      for (const other of entityToReadings.get(entity) ?? []) {
        if (other === id) continue
        const entry = scores.get(other) ?? { score: 0, shared: new Set() }
        if (!entry.shared.has(entity)) {
          entry.shared.add(entity)
          entry.score += 1
        }
        scores.set(other, entry)
      }
    }
    const ranked = [...scores.entries()]
      .filter(([, { shared }]) => shared.size >= MIN_SHARED)
      .map(([other, { score, shared }]) => ({
        id: other,
        slug: `readings/${other}`,
        score,
        shared: [...shared].sort(naturalCompare).slice(0, 4),
      }))
      .sort((a, b) => b.score - a.score || naturalCompare(a.id, b.id))
      .slice(0, MAX_RELATED)
    if (ranked.length) result.set(id, ranked)
  }
  return result
}

/** Test helper: clear memoization between fixtures. */
export function resetRelatedCache() {
  cacheKey = ""
  relatedByReading = new Map()
}
