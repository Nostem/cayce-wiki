import fs from "node:fs"
import path from "node:path"
import {
  slugifyFilePath,
  isRelativeURL,
  simplifySlug,
} from "../../../quartz/util/path"
import type { FilePath } from "../../../quartz/util/path"
import {
  catalogRecord,
  verifyMembership,
} from "../../../quartz/components/library/catalog"
import type { CatalogRecord } from "../../../quartz/components/library/catalog"
import { nameOnlyTargets } from "../../../quartz/components/library/mislinks"
import recovered from "../data/complete-memberships.json"
import topicManifest from "../data/topic-groups.json"
import {
  buildTopicGroups,
  parseTopicManifest,
  type TopicGroupDefinition,
} from "../../../quartz/components/library/topics"
import { catalogPages } from "./catalog-state"

const complete = recovered as Record<string, string[]>
const recoverySlugs = new Map<string, string>()
for (const key of Object.keys(complete)) {
  const route = slugifyFilePath(`${key}.md` as FilePath)
  if (recoverySlugs.has(route)) throw new Error(`Duplicate recovery output ${route}`)
  recoverySlugs.set(route, key)
}

export function prepareCatalogContext(
  content: [string, { data: any; value?: unknown }][],
  opts?: { verifyCorpus?: boolean; topicGroups?: TopicGroupDefinition[] },
) {
  catalogPages.clear()
  const staged: { slug: string; source: string; data: any }[] = []
  const records = new Map<string, CatalogRecord>()
  const raw = new Map<string, string>()
  const metadata = new Map<string, Record<string, unknown>>()
  const verifiedMembers = new Map<string, string[]>()
  /** Reading id → given-name targets whose only in-text links were mislinks. */
  const nameOnly = new Map<string, Set<string>>()
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
      /\/(?:by-date|by-name|by-count)\/page\/\d+$/.test(slug) ||
      /\/page\/\d+$/.test(slug) ||
      !/^(readings|entities|series)\//.test(slug)
    )
      continue
    const source = file.data.filePath
      ? fs.readFileSync(String(file.data.filePath), "utf8")
      : String(file.value)
    const relative = file.data.relativePath
    if (relative && slugifyFilePath(relative) !== slug)
      throw new Error(`Source route mismatch: ${relative} -> ${slug}`)
    staged.push({ slug, source, data: file.data })
    if (slug.startsWith("entities/") || slug.startsWith("series/")) raw.set(slug, source)
    if (slug.startsWith("readings/")) {
      const targets = nameOnlyTargets(source)
      if (targets.size) nameOnly.set(slug.slice("readings/".length), targets)
    }
    metadata.set(slug, (file.data.frontmatter ?? {}) as Record<string, unknown>)
  }
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
    opts?.topicGroups ?? (opts?.verifyCorpus === false ? [] : parseTopicManifest(topicManifest)),
    new Map(
      staged
        .filter((row) => row.slug.startsWith("entities/"))
        .map((row) => [String(row.data.relativePath ?? row.slug + ".md"), records.get(row.slug)!]),
    ),
    verifiedMembers,
    readings,
    new Set([...existing, ...reservedAliases]),
  )
  return {
    records,
    raw,
    metadata,
    verifiedMembers,
    nameOnly,
    existing,
    reservedAliases,
    readings,
    topics,
  }
}
