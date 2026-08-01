#!/usr/bin/env node
/**
 * Split Quartz's monolithic contentIndex.json for large-vault performance.
 *
 * Output:
 *   contentIndex.json — compact search data (title, tags, short excerpt)
 *   graphIndex.json   — links/tags plus a curated global entity graph
 *
 * Search is lazy-loaded by patch-quartz-performance.mjs. The graph index is
 * fetched only when a local/global graph is requested.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs"
import { join } from "node:path"

const target = process.argv[2] ?? join("public", "static", "contentIndex.json")
const EXCERPT = Number(process.argv[3] ?? 180)
const GLOBAL_ENTITY_LIMIT = Number(process.argv[4] ?? 120)
const GLOBAL_NEIGHBORS = Number(process.argv[5] ?? 4)
const SERIES_NEIGHBORS = Number(process.argv[6] ?? 8)
const graphTarget = join(target.slice(0, target.lastIndexOf("/") + 1), "graphIndex.json")

function normalizeSlug(value) {
  return String(value ?? "")
    .replace(/^\/+/, "")
    .replace(/\.html$/, "")
    .replace(/\/$/, "")
}

function excerpt(text) {
  if (typeof text !== "string") return ""
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= EXCERPT) return flat
  let cut = flat.slice(0, EXCERPT)
  const lastSpace = cut.lastIndexOf(" ")
  if (lastSpace > EXCERPT * 0.6) cut = cut.slice(0, lastSpace)
  return cut + "…"
}

function bump(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

const before = statSync(target).size
const source = JSON.parse(readFileSync(target, "utf8"))
const slugs = new Set(Object.keys(source).map(normalizeSlug))
const localAdjacency = new Map([...slugs].map((slug) => [slug, new Set()]))
const entityCounts = new Map()
const readingEntities = new Map()
const readingSeries = new Map()
const seriesSlugByTag = new Map()

for (const [rawSlug, item] of Object.entries(source)) {
  const slug = normalizeSlug(rawSlug)
  for (const link of (item.links ?? []).map(normalizeSlug)) {
    if (link === slug || !slugs.has(link)) continue
    localAdjacency.get(slug)?.add(link)
    localAdjacency.get(link)?.add(slug)
  }
}

for (const rawSlug of Object.keys(source)) {
  const slug = normalizeSlug(rawSlug)
  if (!slug.startsWith("series/")) continue
  const tail = slug.slice("series/".length)
  const range = tail.match(/^([0-9]+(?:-[0-9]+)?)/)?.[1]
  if (range) seriesSlugByTag.set(`series/${range}`, slug)
}

for (const [rawSlug, item] of Object.entries(source)) {
  const slug = normalizeSlug(rawSlug)
  if (!slug.startsWith("readings/")) continue
  const entities = [
    ...new Set(
      (item.links ?? [])
        .map(normalizeSlug)
        .filter((link) => link.startsWith("entities/") && slugs.has(link)),
    ),
  ]
  readingEntities.set(slug, entities)
  for (const entity of entities) bump(entityCounts, entity)
  const series = (item.tags ?? [])
    .filter((tag) => String(tag).startsWith("series/"))
    .map((tag) => seriesSlugByTag.get(String(tag)))
    .filter(Boolean)
  readingSeries.set(slug, [...new Set(series)])
}

const globalEntities = new Set(
  [...entityCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, GLOBAL_ENTITY_LIMIT)
    .map(([slug]) => slug),
)
const globalSeries = new Set(seriesSlugByTag.values())
const pairCounts = new Map()
const seriesEntityCounts = new Map()

for (const [reading, entities] of readingEntities) {
  const selected = entities.filter((entity) => globalEntities.has(entity)).sort()
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      bump(pairCounts, `${selected[i]}\u0000${selected[j]}`)
    }
  }
  for (const series of readingSeries.get(reading) ?? []) {
    for (const entity of selected) bump(seriesEntityCounts, `${series}\u0000${entity}`)
  }
}

const entityAdjacency = new Map([...globalEntities].map((slug) => [slug, new Map()]))
for (const [pair, count] of pairCounts) {
  const [a, b] = pair.split("\u0000")
  entityAdjacency.get(a)?.set(b, count)
  entityAdjacency.get(b)?.set(a, count)
}
const seriesAdjacency = new Map([...globalSeries].map((slug) => [slug, new Map()]))
for (const [pair, count] of seriesEntityCounts) {
  const [series, entity] = pair.split("\u0000")
  seriesAdjacency.get(series)?.set(entity, count)
}

const globalLinks = new Map()
for (const entity of globalEntities) {
  const links = [...(entityAdjacency.get(entity) ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, GLOBAL_NEIGHBORS)
    .map(([slug]) => slug)
  globalLinks.set(entity, new Set(links))
}
for (const series of globalSeries) {
  const links = [...(seriesAdjacency.get(series) ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SERIES_NEIGHBORS)
    .map(([slug]) => slug)
  globalLinks.set(series, new Set(links))
  for (const entity of links) globalLinks.get(entity)?.add(series)
}

const searchIndex = {}
const graphIndex = {}
for (const [rawSlug, item] of Object.entries(source)) {
  const slug = normalizeSlug(rawSlug)
  searchIndex[slug] = {
    title: item.title ?? "",
    tags: item.tags ?? [],
    content: excerpt(item.content),
  }

  const node = {
    title: item.title ?? "",
    tags: item.tags ?? [],
    links: [...(localAdjacency.get(slug) ?? [])].sort(),
  }
  if (globalEntities.has(slug) || globalSeries.has(slug)) {
    node.global = true
    node.globalLinks = [...(globalLinks.get(slug) ?? [])]
  }
  graphIndex[slug] = node
}

writeFileSync(target, JSON.stringify(searchIndex))
writeFileSync(graphTarget, JSON.stringify(graphIndex))
const searchSize = statSync(target).size
const graphSize = statSync(graphTarget).size
const globalEdges = [...globalLinks.values()].reduce((sum, links) => sum + links.size, 0)

console.log(
  `contentIndex.json: ${(before / 1024 / 1024).toFixed(1)} MB -> ${(searchSize / 1024 / 1024).toFixed(1)} MB ` +
    `(lazy search, ${EXCERPT}-char excerpts)`,
)
console.log(
  `graphIndex.json: ${(graphSize / 1024 / 1024).toFixed(1)} MB, lazy; ` +
    `${globalEntities.size} entities + ${globalSeries.size} series, ${globalEdges} directed global edges`,
)
