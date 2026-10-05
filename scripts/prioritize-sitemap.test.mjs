import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

test("sitemap priorities boost readings and deprioritize person stubs", () => {
  const dir = mkdtempSync(join(tmpdir(), "cayce-sitemap-"))
  const path = join(dir, "sitemap.xml")
  writeFileSync(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01T00:00:00.000Z</lastmod></url>
  <url><loc>https://example.com/readings/1527-2</loc></url>
  <url><loc>https://example.com/entities/Atlantis</loc></url>
  <url><loc>https://example.com/entities/%5B23%5D</loc></url>
  <url><loc>https://example.com/entities/1005--0477d720</loc></url>
  <url><loc>https://example.com/series/364</loc></url>
  <url><loc>https://example.com/tags/year/1938</loc></url>
</urlset>
`,
  )
  const run = spawnSync(process.execPath, [new URL("./prioritize-sitemap.mjs", import.meta.url).pathname, path], {
    encoding: "utf8",
  })
  assert.equal(run.status, 0, run.stderr)
  const out = readFileSync(path, "utf8")
  assert.match(out, /readings\/1527-2[\s\S]*<priority>0\.8<\/priority>/)
  assert.match(out, /series\/364[\s\S]*<priority>0\.7<\/priority>/)
  assert.match(out, /entities\/Atlantis[\s\S]*<priority>0\.45<\/priority>/)
  assert.match(out, /entities\/%5B23%5D[\s\S]*<priority>0\.2<\/priority>/)
  assert.match(out, /1005--0477d720[\s\S]*<priority>0\.2<\/priority>/)
  assert.match(out, /tags\/year\/1938[\s\S]*<priority>0\.3<\/priority>/)
  // Homepage / readings should appear before low-priority stubs in document order.
  assert.ok(out.indexOf("readings/1527-2") < out.indexOf("entities/%5B23%5D"))
  rmSync(dir, { recursive: true, force: true })
})
