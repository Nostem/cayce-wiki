import type { VirtualPage } from "../../../quartz/plugins/types"
import {
  compareCatalog,
  paginate,
  naturalCompare,
  defaultCatalogSort,
  pageSlug,
} from "../../../quartz/components/library/catalog"
import type { CatalogRecord, CatalogSort } from "../../../quartz/components/library/catalog"
import type { TopicGroupDefinition } from "../../../quartz/components/library/topics"
import {
  catalogPages,
  outputSlug,
  PREFERRED_ENTITY_TYPES,
  type Collection,
} from "./catalog-state"
import { prepareCatalogContext } from "./catalog-context"

export function generateCatalogPages(
  content: [string, { data: any; value?: unknown }][],
  opts?: { verifyCorpus?: boolean; topicGroups?: TopicGroupDefinition[] },
): VirtualPage[] {
  const {
    records,
    raw,
    metadata,
    verifiedMembers,
    existing,
    reservedAliases,
    readings,
    topics,
  } = prepareCatalogContext(content, opts)
  const collections: Collection[] = []
  for (const kind of ["readings", "entities", "series"])
    collections.push({
      base: kind,
      title:
        kind === "entities"
          ? "Explore topics"
          : kind === "series"
            ? "Read a series"
            : "Browse readings",
      rows: topics.project(
        [...records.values()].filter((r) => r.kind === kind && !r.slug.endsWith("/index")),
      ),
      description:
        kind === "entities"
          ? "Topics ordered by how often they appear across the archive (highest first). Opaque person stubs still exist under Name (A–Z) or person filters. Editorial grouping is not historical wording or a medical equivalence judgment. Verify associations in the source before citation."
          : kind === "series"
            ? "Series titles and membership follow the source index. Short URLs such as /series/364 also work."
            : "Readings in natural number order, with original dates and source metadata. Use Jump to reading for a known identifier. Synopses are machine-generated, not archival text.",
    })
  const tags = new Map<string, CatalogRecord[]>()
  const types = new Map<string, CatalogRecord[]>()
  for (const [slug, row] of records) {
    const fm = metadata.get(slug)!
    const seen = new Set<string>()
    for (const tag of Array.isArray(fm.tags) ? fm.tags : []) {
      const parts = String(tag).split("/")
      for (let i = 1; i <= parts.length; i++) seen.add(parts.slice(0, i).join("/"))
    }
    for (const tag of seen) {
      if (!tags.has(tag)) tags.set(tag, [])
      tags.get(tag)!.push(row)
    }
    if (row.kind === "entities")
      for (const kind of Array.isArray(fm.entity_types) ? fm.entity_types : []) {
        const key = String(kind)
        if (!types.has(key)) types.set(key, [])
        types.get(key)!.push(row)
      }
    if (!["entities", "series"].includes(row.kind) || row.slug.endsWith("/index")) continue
    const checked = verifiedMembers.get(slug)!
    const memberRows = checked.map((id) => readings.get(id)!)
    collections.push({
      base: slug,
      title: row.label,
      combined: topics.bySourceRoute.get(slug),
      rows: memberRows,
      description:
        row.kind === "entities"
          ? `${row.label}: ${fm.literal_reading_count ?? 0} literal and ${fm.semantic_reading_count ?? 0} semantic reading associations (overlap counted once). Generated classifications require verification before citation.`
          : `Series ${fm.series}: ${row.label}. Source index year span: ${fm.year_span ?? "not recorded"}.`,
    })
    if (row.kind === "series" && fm.series != null) {
      const short = `series/${String(fm.series)}`
      if (
        short !== slug &&
        !existing.has(short) &&
        !existing.has(`${short}/index`) &&
        !reservedAliases.has(short) &&
        !reservedAliases.has(`${short}/index`) &&
        !collections.some((c) => c.base === short)
      )
        collections.push({
          base: short,
          title: row.label,
          rows: memberRows,
          description: `Series ${fm.series}: ${row.label}. Short alias for the source series index. Year span: ${fm.year_span ?? "not recorded"}.`,
        })
    }
  }
  for (const [tag, rows] of tags)
    collections.push({
      base: `tags/${tag}`,
      title: `Tag: ${tag}`,
      rows,
      description: `Source-record catalog: records carrying the source tag ${tag}, including its sub-tags. Original entity records are not consolidated in tag catalogs.`,
    })
  for (const [type, rows] of types)
    collections.push({
      base: `catalog/entity-types/${encodeURIComponent(type)}`,
      title: `Topics: ${type}`,
      rows: topics.project(rows),
      description: `Generated entity classification: ${type}. Verify against the readings.`,
    })
  collections[0].filters = [...tags.keys()]
    .filter((t) => t.startsWith("year/"))
    .sort(naturalCompare)
    .map((t) => ({ label: t.slice(5), base: `tags/${t}` }))
  const typeFilters = [...types.keys()]
    .sort(naturalCompare)
    .map((t) => ({ label: t, base: `catalog/entity-types/${encodeURIComponent(t)}` }))
  collections[1].filters = typeFilters
  collections[1].preferredFilters = PREFERRED_ENTITY_TYPES.filter((t) => types.has(t)).map((t) => ({
    label: t.charAt(0).toUpperCase() + t.slice(1) + "s",
    base: `catalog/entity-types/${encodeURIComponent(t)}`,
  }))
  collections.push({
    base: "tags",
    title: "Browse tags",
    description: "Source tags group readings and generated indexes.",
    rows: [...tags].map(([tag, rows]) => ({
      slug: `tags/${tag}/index`,
      label: tag,
      kind: "tags",
      context: `${rows.length} records`,
    })),
  })
  const virtual: VirtualPage[] = []
  for (const topic of topics.groups) {
    collections.push({
      base: topic.row.slug,
      title: topic.row.label,
      rows: topic.readings,
      topic,
      description: `${topic.readings.length.toLocaleString("en-US")} readings from ${topic.sources.length.toLocaleString("en-US")} original source terms. ${topic.definition.kind === "umbrella" ? "Related terms are grouped for browsing, not treated as identical." : "Alternate names are combined for browsing."} Original entries remain available below.`,
    })
    if (topic.sources.length > 8)
      collections.push({
        base: `${topic.row.slug}/source-terms`,
        title: `${topic.row.label} — Source terms`,
        rows: topic.sources,
        combined: topic,
        description:
          "Original source labels and original reading counts. Each source retains its own reading associations.",
      })
  }
  for (const collection of collections) {
    const preferredSort = defaultCatalogSort(collection.base)
    const sorts = (
      collection.rows.length > 40 && collection.rows.some((r) => r.kind === "readings")
        ? preferredSort === "count"
          ? ["count", "id", "date"]
          : ["id", "date"]
        : preferredSort === "count"
          ? ["count", "id"]
          : ["id"]
    ) as CatalogSort[]
    for (const sort of sorts) {
      const sorted = { ...collection, rows: [...collection.rows].sort(compareCatalog(sort)) }
      const count = paginate(sorted.rows).pages
      for (let number = 1; number <= count; number++) {
        const slug = pageSlug(collection.base, number, sort, preferredSort)
        if (catalogPages.has(slug)) throw new Error(`Duplicate catalog route ${slug}`)
        catalogPages.set(slug, { collection: sorted, sort, number, preferredSort })
        const output = outputSlug(slug)
        if (
          collection.base.startsWith("topics/") &&
          (existing.has(output) ||
            existing.has(`${output}/index`) ||
            reservedAliases.has(output) ||
            reservedAliases.has(`${output}/index`))
        )
          throw new Error(`Colliding topic route: ${output}`)
        const sortLabel =
          sort === "date"
            ? " — Original date"
            : sort === "id" && preferredSort === "count"
              ? " — Name"
              : sort === "count" && preferredSort !== "count"
                ? " — Most readings"
                : ""
        const title = `${collection.title}${sortLabel}${number > 1 ? ` — Page ${number}` : ""}`
        if (!existing.has(output))
          virtual.push({
            slug: output,
            title,
            data: {
              unlisted: true,
              libraryCatalog: true,
              description: collection.description,
            },
          })
      }
    }
  }
  for (const [, file] of content) {
    const state = catalogPages.get(String(file.data.slug).replace(/\/index$/, ""))
    if (state) {
      file.data.libraryCatalog = true
      if (file.data.frontmatter && !raw.has(String(file.data.slug))) {
        file.data.frontmatter.title = state.collection.title
        file.data.frontmatter.description = state.collection.description
      }
    }
  }
  return virtual
}
