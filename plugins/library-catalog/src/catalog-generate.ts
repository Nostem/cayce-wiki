import type { VirtualPage } from "../../../quartz/plugins/types"
import {
  compareCatalog,
  paginate,
  naturalCompare,
  defaultCatalogSort,
  pageSlug,
  isCaseOpening,
  readingTypeSlug,
} from "../../../quartz/components/library/catalog"
import type { CatalogRecord, CatalogSort } from "../../../quartz/components/library/catalog"
import { entityKey, isGivenNameTarget } from "../../../quartz/components/library/mislinks"
import type { TopicGroupDefinition } from "../../../quartz/components/library/topics"
import {
  catalogPages,
  outputSlug,
  PREFERRED_ENTITY_TYPES,
  type Collection,
} from "./catalog-state"
import { prepareCatalogContext } from "./catalog-context"

function annotateEntityMembership(
  entityLabel: string,
  readingId: string,
  reading: CatalogRecord,
  metadata: Map<string, Record<string, unknown>>,
  nameOnly: ReadonlyMap<string, ReadonlySet<string>>,
): CatalogRecord {
  const fm = metadata.get(`readings/${readingId}`) ?? {}
  const named = Array.isArray(fm.entities)
    ? fm.entities.map((value) => String(value))
    : []
  const literal = named.some(
    (name) => name === entityLabel || name.toLowerCase() === entityLabel.toLowerCase(),
  )
  // A "literal" match whose only in-text links were a bare given name used for someone
  // else (e.g. "Dr. Mary Miller" → Virgin Mary) is kept in the list but not called strong.
  if (literal && nameOnly.get(readingId)?.has(entityKey(entityLabel)))
    return {
      ...reading,
      association: "name-only",
      context: [
        reading.context,
        "Name match only (the reading’s links used this given name for a different person)",
      ]
        .filter(Boolean)
        .join(" · "),
    }
  return {
    ...reading,
    association: literal ? "literal" : "semantic",
    context: literal
      ? [reading.context, "Strong match (named in reading entities)"].filter(Boolean).join(" · ")
      : [reading.context, "Indexed association (verify in source)"].filter(Boolean).join(" · "),
  }
}

export function generateCatalogPages(
  content: [string, { data: any; value?: unknown }][],
  opts?: { verifyCorpus?: boolean; topicGroups?: TopicGroupDefinition[] },
): VirtualPage[] {
  const {
    records,
    raw,
    metadata,
    verifiedMembers,
    nameOnly,
    existing,
    reservedAliases,
    readings,
    topics,
  } = prepareCatalogContext(content, opts)
  // Lean prod builds skip ~10k per-entity/series membership virtual pages and tag fan-out.
  // Hubs, facets, and topic pages remain. Source entity/series notes still emit as content.
  const leanCatalog = process.env.CAYCE_LEAN_CATALOG === "1"
  // Optional hard page cap; lean mode alone does not truncate hub/topic pagination.
  const maxPagesEnv = Number.parseInt(process.env.CAYCE_CATALOG_MAX_PAGES ?? "", 10)
  const maxPages = Number.isFinite(maxPagesEnv) && maxPagesEnv > 0 ? maxPagesEnv : 0
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
            : "Readings in natural number order, with original dates and source metadata. Use Jump to reading for a known identifier. Filter by reading type or case openings when available. Synopses are machine-generated, not archival text.",
    })
  const tags = new Map<string, CatalogRecord[]>()
  const types = new Map<string, CatalogRecord[]>()
  const readingTypes = new Map<string, CatalogRecord[]>()
  const caseOpenings: CatalogRecord[] = []
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
    if (row.kind === "readings") {
      if (row.readingType) {
        if (!readingTypes.has(row.readingType)) readingTypes.set(row.readingType, [])
        readingTypes.get(row.readingType)!.push(row)
      }
      if (isCaseOpening(row.label)) caseOpenings.push(row)
    }
    if (!["entities", "series"].includes(row.kind) || row.slug.endsWith("/index")) continue
    // Membership virtual catalogs duplicate source notes for browse; skip in lean prod.
    if (leanCatalog) continue
    const checked = verifiedMembers.get(slug)!
    const memberRows =
      row.kind === "entities"
        ? checked.map((id) =>
            annotateEntityMembership(row.label, id, readings.get(id)!, metadata, nameOnly),
          )
        : checked.map((id) => readings.get(id)!)
    const nameOnlyNote =
      row.kind === "entities" && isGivenNameTarget(entityKey(row.label))
        ? " Name-match-only rows: the reading’s only links to this entry used a bare given name for someone else (for example “Dr. Mary Miller” or “Mr. David E. Kahn”); they stay listed for provenance."
        : ""
    collections.push({
      base: slug,
      title: row.label,
      combined: topics.bySourceRoute.get(slug),
      rows: memberRows,
      description:
        row.kind === "entities"
          ? `${row.label}: ${fm.literal_reading_count ?? 0} literal and ${fm.semantic_reading_count ?? 0} semantic reading associations (overlap counted once). Strong-match rows are named in the reading’s entity list; Indexed associations may be name-drops or LLM indexes — verify before citation.${nameOnlyNote}`
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
  if (!leanCatalog) {
    for (const [tag, rows] of tags)
      collections.push({
        base: `tags/${tag}`,
        title: `Tag: ${tag}`,
        rows,
        description: `Source-record catalog: records carrying the source tag ${tag}, including its sub-tags. Original entity records are not consolidated in tag catalogs.`,
      })
  }
  for (const [type, rows] of types)
    collections.push({
      base: `catalog/entity-types/${encodeURIComponent(type)}`,
      title: `Topics: ${type}`,
      rows: topics.project(rows),
      description: `Generated entity classification: ${type}. Verify against the readings.`,
    })
  for (const [type, rows] of readingTypes)
    collections.push({
      base: `catalog/reading-types/${readingTypeSlug(type)}`,
      title: `Readings: ${type}`,
      rows,
      description: `${type} readings detected from the archival suggestion line in the source transcript (for example “(Physical Suggestion)” or “(Life Reading Suggestion)”). Readings without such a line are not listed, so this is a partial view. Not an A.R.E. catalog facet — verify in the preamble.`,
    })
  if (caseOpenings.length)
    collections.push({
      base: "catalog/case-openings",
      title: "Start of a case",
      rows: caseOpenings,
      description:
        "First reading in each case number (identifiers ending in -1). Useful for beginning a series chronologically within a person/case.",
    })
  const yearFilters = [...tags.keys()]
    .filter((t) => t.startsWith("year/"))
    .sort(naturalCompare)
    .map((t) => ({ label: t.slice(5), base: `tags/${t}` }))
  const typeReadingFilters = [...readingTypes.keys()]
    .sort(naturalCompare)
    .map((t) => ({
      label: t,
      base: `catalog/reading-types/${readingTypeSlug(t)}`,
    }))
  collections[0].filters = [
    ...typeReadingFilters,
    ...(caseOpenings.length
      ? [{ label: "Start of a case (*-1)", base: "catalog/case-openings" }]
      : []),
    ...(leanCatalog ? [] : yearFilters),
  ]
  collections[0].preferredFilters = [
    ...["Physical", "Life", "Business", "Dream"]
      .filter((t) => readingTypes.has(t))
      .map((t) => ({
        label: t,
        base: `catalog/reading-types/${readingTypeSlug(t)}`,
      })),
    ...(caseOpenings.length
      ? [{ label: "Case openings", base: "catalog/case-openings" }]
      : []),
  ]
  const typeFilters = [...types.keys()]
    .sort(naturalCompare)
    .map((t) => ({ label: t, base: `catalog/entity-types/${encodeURIComponent(t)}` }))
  collections[1].filters = typeFilters
  collections[1].preferredFilters = PREFERRED_ENTITY_TYPES.filter((t) => types.has(t)).map((t) => ({
    label: t.charAt(0).toUpperCase() + t.slice(1) + "s",
    base: `catalog/entity-types/${encodeURIComponent(t)}`,
  }))
  if (!leanCatalog) {
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
  }
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
    // Prod emit: default sort only. Secondary by-date / by-name duplicates roughly
    // doubled catalog virtual URLs without enough navigation value to justify the cost.
    const sorts = [preferredSort] as CatalogSort[]
    for (const sort of sorts) {
      const sorted = { ...collection, rows: [...collection.rows].sort(compareCatalog(sort)) }
      const count = paginate(sorted.rows).pages
      const pageLimit = maxPages > 0 ? Math.min(count, maxPages) : count
      for (let number = 1; number <= pageLimit; number++) {
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
