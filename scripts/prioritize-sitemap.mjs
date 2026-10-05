#!/usr/bin/env node
/**
 * Rewrite Quartz's flat sitemap.xml with priority / changefreq / lastmod hints.
 *
 * Prefer readings, curated topics, and series. Deprioritize low-value person stubs
 * (opaque [n] labels) and collision-displaced hashed entity routes. Catalog
 * pagination is already unlisted by LibraryCatalog and absent from the sitemap.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const target = process.argv[2] ?? join("public", "sitemap.xml")
const baseHost = process.argv[3] // optional override, e.g. cayce-wiki.vercel.app

if (!existsSync(target)) {
  console.warn(`prioritize-sitemap: ${target} not found; skipping`)
  process.exit(0)
}

const xml = readFileSync(target, "utf8")
const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1])

function locOf(block) {
  return block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1]?.trim() ?? ""
}

function lastmodOf(block) {
  return block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1]?.trim()
}

function pathOf(loc) {
  try {
    const u = new URL(loc)
    return decodeURIComponent(u.pathname.replace(/^\/+/, "").replace(/\/$/, ""))
  } catch {
    return loc.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "")
  }
}

function classify(path) {
  if (!path || path === "index" || path === "") {
    return { priority: "1.0", changefreq: "weekly" }
  }
  if (path.startsWith("readings/")) {
    return { priority: "0.8", changefreq: "monthly" }
  }
  if (path.startsWith("series/") || path.startsWith("topics/")) {
    return { priority: "0.7", changefreq: "monthly" }
  }
  if (path === "readings" || path === "entities" || path === "series" || path === "tags") {
    return { priority: "0.75", changefreq: "weekly" }
  }
  if (path.startsWith("entities/")) {
    const leaf = path.slice("entities/".length)
    // Opaque person stubs and collision-displaced hashes are weak landings.
    if (/^\[\d+\]/.test(leaf) || /--[0-9a-f]{6,}$/i.test(leaf) || /^\d+$/.test(leaf)) {
      return { priority: "0.2", changefreq: "yearly", exclude: false }
    }
    return { priority: "0.45", changefreq: "monthly" }
  }
  if (path.startsWith("tags/")) {
    return { priority: "0.3", changefreq: "yearly" }
  }
  return { priority: "0.4", changefreq: "monthly" }
}

const entries = []
let excluded = 0
for (const block of urlBlocks) {
  const loc = locOf(block)
  if (!loc) continue
  let finalLoc = loc
  if (baseHost) {
    try {
      if (pathOf(loc) === "") finalLoc = `https://${baseHost.replace(/^https?:\/\//, "")}/`
      else finalLoc = `https://${baseHost.replace(/^https?:\/\//, "")}/${pathOf(loc)}`
    } catch {
      /* keep loc */
    }
  }
  const path = pathOf(loc)
  const meta = classify(path)
  if (meta.exclude) {
    excluded++
    continue
  }
  const lastmod = lastmodOf(block)
  entries.push({ loc: finalLoc || loc, path, meta, lastmod })
}

// Readings and curated hubs first in the file (crawlers that truncate still see them).
entries.sort((a, b) => {
  const pa = Number(a.meta.priority)
  const pb = Number(b.meta.priority)
  if (pa !== pb) return pb - pa
  return a.path.localeCompare(b.path, "en", { numeric: true })
})

const body = entries
  .map(({ loc, meta, lastmod }) => {
    const parts = [`    <loc>${escapeXml(loc)}</loc>`]
    if (lastmod) parts.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`)
    parts.push(`    <changefreq>${meta.changefreq}</changefreq>`)
    parts.push(`    <priority>${meta.priority}</priority>`)
    return `  <url>\n${parts.join("\n")}\n  </url>`
  })
  .join("\n")

const out = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`

writeFileSync(target, out)
console.log(
  `sitemap.xml: ${entries.length} urls prioritized` +
    (excluded ? ` (${excluded} excluded)` : "") +
    ` → ${target}`,
)

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
