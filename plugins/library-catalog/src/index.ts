import fs from "node:fs"
import path from "node:path"
import { h } from "preact"
import type { QuartzPageTypePlugin, VirtualPage } from "../../../quartz/plugins/types"
import type { QuartzComponent } from "../../../quartz/components/types"
import {
  resolveRelative,
  slugifyFilePath,
  isRelativeURL,
  simplifySlug,
} from "../../../quartz/util/path"
import type { FullSlug, FilePath } from "../../../quartz/util/path"
import {
  catalogRecord,
  compareCatalog,
  paginate,
  naturalCompare,
  verifyMembership,
} from "../../../quartz/components/library/catalog"
import type { CatalogRecord, CatalogSort } from "../../../quartz/components/library/catalog"
import recovered from "../data/complete-memberships.json"
import topicManifest from "../data/topic-groups.json"
import {
  buildTopicGroups,
  parseTopicManifest,
  type TopicGroupDefinition,
  type TopicGroup,
} from "../../../quartz/components/library/topics"

interface Collection {
  base: string
  title: string
  rows: CatalogRecord[]
  description: string
  topic?: TopicGroup
  combined?: TopicGroup
  filters?: { label: string; base: string }[]
}
interface Page {
  collection: Collection
  sort: CatalogSort
  number: number
}
const complete = recovered as Record<string, string[]>
function pageSlug(base: string, page: number, sort: CatalogSort = "id") {
  return sort === "date"
    ? `${base}/by-date/page/${page}`
    : page === 1
      ? base
      : `${base}/page/${page}`
}
function outputSlug(slug: string) {
  if (slug.endsWith("/index")) return slug
  return ["readings", "entities", "series", "tags"].includes(slug) ||
    (/^tags\//.test(slug) && !/\/page\/\d+$/.test(slug) && !/\/by-date\//.test(slug))
    ? `${slug}/index`
    : slug
}

/** Owns folder/tag catalogs and entity/series bodies; disable packaged folder/tag generators. */
export const LibraryCatalog: QuartzPageTypePlugin<{
  verifyCorpus?: boolean
  topicGroups?: TopicGroupDefinition[]
}> = (opts) => {
  let pages = new Map<string, Page>()
  const Body: QuartzComponent = ({ fileData }) => {
    const key = String(fileData.slug).replace(/\/index$/, "")
    const state = pages.get(key)
    if (!state) throw new Error(`Catalog page not prepared: ${key}`)
    const { collection, sort, number } = state
    const result = paginate(collection.rows, number)
    const href = (target: string) => resolveRelative(fileData.slug!, outputSlug(target) as FullSlug)
    const link = (target: string, label: string, extra = {}) =>
      h("a", { href: href(target), class: "internal", ...extra }, label)
    const navigation = h(
      "nav",
      { "aria-label": "Catalog pagination" },
      number > 1 && link(pageSlug(collection.base, 1, sort), "First page"),
      " ",
      number > 1 &&
        link(pageSlug(collection.base, number - 1, sort), "Previous page", { rel: "prev" }),
      " ",
      h("span", { "aria-current": "page" }, `Page ${number} of ${result.pages}`),
      " ",
      number < result.pages &&
        link(pageSlug(collection.base, number + 1, sort), "Next page", { rel: "next" }),
      " ",
      number < result.pages && link(pageSlug(collection.base, result.pages, sort), "Last page"),
    )
    return h(
      "section",
      { class: "library-catalog", "aria-label": collection.title },
      h("p", null, collection.description),
      collection.combined &&
        h(
          "p",
          { class: "catalog-combined" },
          h(
            "strong",
            null,
            link(
              collection.combined.row.slug,
              `View combined topic: ${collection.combined.row.label}`,
            ),
          ),
        ),
      collection.topic &&
        number === 1 &&
        sort === "id" &&
        h(
          "section",
          { "aria-label": "Source terms" },
          h("h2", null, "Source terms"),
          h(
            "ul",
            null,
            collection.topic.sources
              .slice(0, 8)
              .map((source) =>
                h(
                  "li",
                  { class: "topic-source", key: source.slug },
                  link(source.slug, source.label),
                  ` · ${source.count ?? 0} readings`,
                ),
              ),
          ),
          collection.topic.sources.length > 8 &&
            link(
              `${collection.topic.row.slug}/source-terms`,
              `View all ${collection.topic.sources.length} source terms`,
            ),
        ),
      h(
        "p",
        { class: "catalog-count" },
        `${result.start}–${result.end} of ${result.total.toLocaleString("en-US")} records`,
      ),
      pages.has(pageSlug(collection.base, 1, "date")) &&
        h(
          "nav",
          { "aria-label": "Sort readings" },
          link(pageSlug(collection.base, 1, "id"), "Reading number", {
            "aria-current": sort === "id" ? "true" : undefined,
          }),
          " · ",
          link(pageSlug(collection.base, 1, "date"), "Original date (oldest first)", {
            "aria-current": sort === "date" ? "true" : undefined,
          }),
        ),
      collection.filters?.length
        ? h(
            "details",
            { class: "catalog-filters" },
            h("summary", null, "Filter this collection"),
            h(
              "ul",
              null,
              collection.filters.map((f) => h("li", { key: f.base }, link(f.base, f.label))),
            ),
          )
        : null,
      navigation,
      h(
        "ol",
        { class: "catalog-rows", start: result.start || 1 },
        result.rows.map((row) =>
          h(
            "li",
            { key: row.slug, class: "catalog-row" },
            h(
              "h3",
              { style: { overflowWrap: "anywhere" } },
              link(row.slug, row.kind === "readings" ? `Reading ${row.label}` : row.label),
            ),
            h(
              "p",
              { class: "catalog-context" },
              [
                row.date
                  ? `Original date: ${row.date}`
                  : row.kind === "readings"
                    ? row.year
                      ? `Source year: ${row.year}; full date unavailable`
                      : "Original date unavailable"
                    : undefined,
                row.context,
                row.count === undefined
                  ? undefined
                  : `${row.count.toLocaleString("en-US")} readings`,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
            row.summary &&
              h(
                "p",
                { class: "catalog-summary" },
                h("strong", null, "Generated synopsis: "),
                row.summary,
              ),
          ),
        ),
      ),
      result.pages > 1 && navigation,
      h(
        "p",
        { class: "catalog-fallback" },
        "All records are available through these pages. Pagination and filters work without JavaScript.",
      ),
    )
  }
  return {
    name: "LibraryCatalog",
    priority: 100,
    layout: "catalog",
    body: () => Body,
    match: ({ slug }) => pages.has(slug.replace(/\/index$/, "")),
    generate({ content }) {
      pages = new Map()
      const staged: { slug: string; source: string; data: (typeof content)[number][1]["data"] }[] =
        []
      const records = new Map<string, CatalogRecord>()
      const raw = new Map<string, string>()
      const metadata = new Map<string, Record<string, unknown>>()
      const verifiedMembers = new Map<string, string[]>()
      const existing = new Set<string>()
      const reservedAliases = new Set<string>()
      for (const [, file] of content) {
        const slug = String(file.data.slug)
        if (existing.has(slug)) throw new Error(`Duplicate source output ${slug}`)
        existing.add(slug)
        for (const alias of file.data.aliases ?? []) {
          reservedAliases.add(
            isRelativeURL(alias)
              ? path.posix.normalize(path.posix.join(simplifySlug(file.data.slug!), "..", alias))
              : alias,
          )
        }
        if (
          slug.endsWith("/index") ||
          /\/(?:by-date\/)?page\/\d+$/.test(slug) ||
          !/^(readings|entities|series)\//.test(slug)
        )
          continue
        // Read immutable source once; transformed vfile.value may no longer contain wikilinks.
        const source = file.data.filePath
          ? fs.readFileSync(String(file.data.filePath), "utf8")
          : String(file.value)
        const relative = file.data.relativePath
        if (relative && slugifyFilePath(relative) !== slug)
          throw new Error(`Source route mismatch: ${relative} -> ${slug}`)
        staged.push({ slug, source, data: file.data })
        if (slug.startsWith("entities/") || slug.startsWith("series/")) raw.set(slug, source)
        metadata.set(slug, (file.data.frontmatter ?? {}) as Record<string, unknown>)
      }
      // Validate every source identity and membership BEFORE reducing to route-keyed maps.
      const stagedReadings = staged.filter((row) => row.slug.startsWith("readings/"))
      const availableSources = new Set(stagedReadings.map((row) => row.slug.slice(9)))
      const expectedCounts = { readings: 14306, entities: 10731, series: 19 }
      if (opts?.verifyCorpus !== false) {
        for (const [kind, expected] of Object.entries(expectedCounts)) {
          const actual = staged.filter((row) => row.slug.startsWith(`${kind}/`)).length
          if (actual !== expected)
            throw new Error(`Source coverage ${kind}: expected ${expected}, received ${actual}`)
        }
        if (staged.length !== 25056)
          throw new Error(`Source coverage: expected 25056, received ${staged.length}`)
      }
      const sourceIdentities = new Set<string>()
      for (const row of staged) {
        const identity = String(row.data.relativePath ?? row.data.filePath ?? row.slug)
        if (sourceIdentities.has(identity)) throw new Error(`Duplicate source identity ${identity}`)
        sourceIdentities.add(identity)
        const fm = (row.data.frontmatter ?? {}) as Record<string, unknown>
        if (!row.slug.startsWith("readings/")) {
          const prefix = [...row.source.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) =>
            m[1].replace(/^readings\//, ""),
          )
          const recoveryKey = recoverySlugs.get(row.slug)
          const members = row.slug.startsWith("series/")
            ? stagedReadings
                .filter((r) => String(r.data.frontmatter?.series) === String(fm.series))
                .map((r) => r.slug.slice(9))
            : recoveryKey
              ? complete[recoveryKey]
              : prefix
          if (typeof fm.reading_count !== "number")
            throw new Error(`${identity}: missing declared membership count`)
          const checked = new Set(
            verifyMembership(identity, members, fm.reading_count, availableSources),
          )
          if (prefix.some((id) => !checked.has(id)))
            throw new Error(`${identity}: recovered membership disagrees with source links`)
          verifiedMembers.set(row.slug, [...checked])
        }
      }
      for (const row of staged) records.set(row.slug, catalogRecord(row.data, row.source))
      const readings = new Map(
        [...records]
          .filter(([, r]) => r.kind === "readings")
          .map(([slug, r]) => [slug.slice("readings/".length), r]),
      )
      const topics = buildTopicGroups(
        opts?.topicGroups ??
          (opts?.verifyCorpus === false ? [] : parseTopicManifest(topicManifest)),
        new Map(
          staged
            .filter((row) => row.slug.startsWith("entities/"))
            .map((row) => [
              String(row.data.relativePath ?? row.slug + ".md"),
              records.get(row.slug)!,
            ]),
        ),
        verifiedMembers,
        readings,
        new Set([...existing, ...reservedAliases]),
      )
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
              ? "Consolidated topic indexes retain original source terms separately. Editorial grouping is not historical wording or a medical equivalence judgment. Verify associations in the source before citation."
              : kind === "series"
                ? "Series titles and membership follow the source index."
                : "Readings in natural number order, with original dates and source metadata. Synopses are machine-generated, not archival text.",
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
        collections.push({
          base: slug,
          title: row.label,
          combined: topics.bySourceRoute.get(slug),
          rows: checked.map((id) => readings.get(id)!),
          description:
            row.kind === "entities"
              ? `${row.label}: ${fm.literal_reading_count ?? 0} literal and ${fm.semantic_reading_count ?? 0} semantic reading associations (overlap counted once). Generated classifications require verification before citation.`
              : `Series ${fm.series}: ${row.label}. Source index year span: ${fm.year_span ?? "not recorded"}.`,
        })
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
      collections[1].filters = [...types.keys()]
        .sort(naturalCompare)
        .map((t) => ({ label: t, base: `catalog/entity-types/${encodeURIComponent(t)}` }))
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
        for (const sort of (collection.rows.length > 40 &&
        collection.rows.some((r) => r.kind === "readings")
          ? ["id", "date"]
          : ["id"]) as CatalogSort[]) {
          const sorted = { ...collection, rows: [...collection.rows].sort(compareCatalog(sort)) }
          const count = paginate(sorted.rows).pages
          for (let number = 1; number <= count; number++) {
            const slug = pageSlug(collection.base, number, sort)
            if (pages.has(slug)) throw new Error(`Duplicate catalog route ${slug}`)
            pages.set(slug, { collection: sorted, sort, number })
            const output = outputSlug(slug)
            if (
              collection.base.startsWith("topics/") &&
              (existing.has(output) ||
                existing.has(`${output}/index`) ||
                reservedAliases.has(output) ||
                reservedAliases.has(`${output}/index`))
            )
              throw new Error(`Colliding topic route: ${output}`)
            const title = `${collection.title}${sort === "date" ? " — Original date" : ""}${number > 1 ? ` — Page ${number}` : ""}`
            if (!existing.has(output))
              virtual.push({ slug: output, title, data: { unlisted: true, libraryCatalog: true } })
          }
        }
      }
      // Replace stale count-bearing shell titles in memory, never source files.
      for (const [, file] of content) {
        const state = pages.get(String(file.data.slug).replace(/\/index$/, ""))
        if (state) {
          file.data.libraryCatalog = true
          if (file.data.frontmatter && !raw.has(String(file.data.slug)))
            file.data.frontmatter.title = state.collection.title
        }
      }
      return virtual
    },
  }
}
const recoverySlugs = new Map<string, string>()
for (const key of Object.keys(complete)) {
  const route = slugifyFilePath(`${key}.md` as FilePath)
  if (recoverySlugs.has(route)) throw new Error(`Duplicate recovery output ${route}`)
  recoverySlugs.set(route, key)
}
export default LibraryCatalog
