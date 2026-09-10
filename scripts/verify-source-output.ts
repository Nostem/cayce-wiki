import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { sourceRouteMap } from "../quartz/util/sourceRoutes"

const escapeAttribute = (value: string) =>
  value.replace(
    /[&"<>]/g,
    (char) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[char]!,
  )

/** Check final output, after aliases and every other emitter have run. */
export function assertSourcePage(html: string, slug: string): void {
  assert.ok(
    !/<meta\b[^>]*http-equiv=["']?refresh\b/i.test(html),
    `${slug}: source replaced by redirect`,
  )
  const body = /<body\b[^>]*\bdata-slug="([^"]+)"/i.exec(html)
  assert.equal(body?.[1], escapeAttribute(slug), `${slug}: wrong rendered source identity`)
  assert.equal((html.match(/<main\b/gi) ?? []).length, 1, `${slug}: missing source main`)
}

export function verifySourceOutput(output: string): number {
  const files = execFileSync("git", [
    "ls-files",
    "-z",
    "content/readings",
    "content/entities",
    "content/series",
  ])
    .toString()
    .split("\0")
    .filter(Boolean)
  for (const [kind, expected] of Object.entries({ readings: 14306, entities: 10731, series: 19 }))
    assert.equal(files.filter((file) => file.startsWith(`content/${kind}/`)).length, expected, kind)
  const routes = sourceRouteMap(files.map((file) => file.slice("content/".length)))
  for (const [, slug] of routes)
    assertSourcePage(readFileSync(path.join(output, slug + ".html"), "utf8"), slug)
  return routes.size
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(
    `Verified final HTML identities for ${verifySourceOutput(process.argv[2] ?? "public")} protected sources`,
  )
