#!/usr/bin/env node
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Only the paths emitted by ComponentResources qualify. Verify its SHA-256
// prefix against the copied bytes too: a hash-looking name is not sufficient.
// Google font filenames are opaque upstream IDs, not verified content hashes.
const hashedAsset =
  /^(?:(?:index|component)-[a-f0-9]{8}\.css|(?:prescript|postscript)-[a-f0-9]{8}\.js|static\/scripts\/script-\d+-[a-f0-9]{8}\.js|static\/resource-style-[a-f0-9]{8}\.css|static\/resource-(?:before|after)-[a-f0-9]{8}\.js)$/

function immutableRoutes(staticTarget) {
  const paths = []
  // No need to traverse the large HTML corpus or unversioned font directories.
  for (const directory of ["", "static", "static/scripts"]) {
    let entries
    try {
      entries = readdirSync(join(staticTarget, directory), { withFileTypes: true })
    } catch (error) {
      if (error.code === "ENOENT") continue
      throw error
    }
    for (const entry of entries) {
      const path = directory ? `${directory}/${entry.name}` : entry.name
      if (!entry.isFile() || !hashedAsset.test(path)) continue
      const digest = createHash("sha256")
        .update(readFileSync(join(staticTarget, path)))
        .digest("hex")
        .slice(0, 8)
      if (!path.endsWith(`-${digest}.css`) && !path.endsWith(`-${digest}.js`)) continue
      paths.push(`/${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    }
  }

  // Exact paths avoid caching missing assets or similarly named stable files.
  // Batch small alternations to keep both route count and regex length bounded.
  const routes = []
  let batch = []
  function flush() {
    if (batch.length === 0) return
    routes.push({
      src: `^(?:${batch.join("|")})$`,
      headers: { "Cache-Control": "public,max-age=31536000,immutable" },
      continue: true,
      caseSensitive: true,
    })
    batch = []
  }
  for (const path of paths.sort()) {
    if (`^(?:${[...batch, path].join("|")})$`.length > 2048) flush()
    batch.push(path)
  }
  flush()
  return routes
}

const source = process.argv[2] ?? "public"
const outputRoot = process.argv[3] ?? ".vercel/output"
const staticTarget = join(outputRoot, "static")

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })
cpSync(source, staticTarget, { recursive: true })
writeFileSync(
  join(outputRoot, "config.json"),
  `${JSON.stringify({ version: 3, routes: [...immutableRoutes(staticTarget), { handle: "filesystem" }] }, null, 2)}\n`,
)

const config = JSON.parse(readFileSync(join(outputRoot, "config.json"), "utf8"))
if (config.version !== 3) throw new Error("invalid Vercel Build Output API configuration")
console.log(`Prepared ${staticTarget} for a prebuilt Vercel deployment`)
