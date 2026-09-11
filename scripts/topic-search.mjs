import { readFileSync } from "node:fs"
import { join } from "node:path"

// Source identity is the full index's exact content-relative filePath, never a
// reconstructed slug. Only the caller's compact search projection is changed.
export function topicSearchProjection(source, manifest, outputDir, existingSlugs) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.groups)) {
    throw new Error("Invalid topic manifest: expected version 1 and groups array")
  }
  const byPath = new Map()
  for (const [slug, item] of Object.entries(source)) {
    if (typeof item.filePath !== "string") continue
    const entries = byPath.get(item.filePath) ?? []
    entries.push([slug, item])
    byPath.set(item.filePath, entries)
  }
  const ids = new Set()
  const owners = new Set()
  const members = new Set()
  const documents = {}
  for (const group of manifest.groups) {
    if (typeof group?.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group.id)) {
      throw new Error(`Invalid topic group ID: ${group?.id}`)
    }
    const route = `topics/${group.id}`
    if (ids.has(group.id)) throw new Error(`Duplicate topic group ID: ${group.id}`)
    ids.add(group.id)
    if (existingSlugs.has(route)) throw new Error(`Topic search route collision: ${route}`)
    if (
      typeof group.label !== "string" ||
      !group.label.trim() ||
      !["equivalent", "umbrella"].includes(group.kind) ||
      typeof group.reason !== "string" ||
      !group.reason.trim() ||
      !Array.isArray(group.sources) ||
      group.sources.length < 2
    ) {
      throw new Error(`Invalid topic group: ${group.id}`)
    }
    const aliases = new Set()
    for (const path of group.sources) {
      if (typeof path !== "string" || !/^entities\/[^/\\\u0000-\u001f]+\.md$/.test(path)) {
        throw new Error(`Invalid topic source filePath: ${path}`)
      }
      if (owners.has(path)) throw new Error(`Topic source multiply owned: ${path}`)
      owners.add(path)
      const matches = byPath.get(path) ?? []
      if (!matches.length) throw new Error(`Missing topic source filePath: ${path}`)
      if (matches.length !== 1) throw new Error(`Ambiguous topic source filePath: ${path}`)
      const [slug, item] = matches[0]
      if (typeof item.title !== "string" || !item.title.trim()) {
        throw new Error(`Missing topic source title: ${path}`)
      }
      members.add(slug)
      aliases.add(item.title)
    }
    // Labels alone bypass the ordinary excerpt limit. Never copy transcripts,
    // reading memberships, or aliases into the visible tag filters.
    documents[route] = { title: group.label, tags: [], content: [...aliases].join("\n") }
  }
  // Validate every target before the CLI writes either output. Catalog pages
  // must already have been emitted; previews must run this same post-build step.
  for (const route of Object.keys(documents)) {
    const htmlPath = join(outputDir, `${route}.html`)
    const html = readFileSync(htmlPath, "utf8")
    const body = html.match(/<body\b[^>]*>/i)?.[0] ?? ""
    const slug = body.match(/\sdata-slug\s*=\s*(["'])(.*?)\1/i)?.[2]
    if (slug !== route)
      throw new Error(`Topic HTML data-slug mismatch: ${htmlPath} (expected ${route})`)
  }
  return { members, documents }
}
