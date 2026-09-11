import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"
import { searchFixture } from "./test-helpers/search-fixture.mjs"

const script = new URL("./strip-content-index.mjs", import.meta.url).pathname
const route = "topics/acidity-and-alkalinity"
const labels = ["Acidity " + "original label ".repeat(20), "Alkalinity", "Zymographic"]
const source = Object.fromEntries(
  labels.map((title, i) => [
    `entities/member-${i}`,
    {
      title,
      filePath: `entities/Exact ${i}.md`,
      tags: ["entity"],
      content: "Do not include transcript or membership payload",
      links: ["readings/1-1"],
    },
  ]),
)
source["entities/singleton"] = {
  title: "Singleton",
  filePath: "entities/Singleton.md",
  content: "Singleton",
  tags: ["entity"],
  links: [],
}
source["readings/1-1"] = {
  title: "1-1",
  content: "Unchanged reading",
  tags: ["reading"],
  links: Object.keys(source),
}
const group = {
  id: "acidity-and-alkalinity",
  label: "Acidity and Alkalinity",
  kind: "equivalent",
  reason: "Equivalent labels",
  sources: labels.map((_, i) => `entities/Exact ${i}.md`),
}

function run(
  input = source,
  groups = [group],
  html = `<html><body data-slug="${route}"></body></html>`,
) {
  const dir = mkdtempSync(join(tmpdir(), "topic-search-"))
  try {
    mkdirSync(join(dir, "static"))
    mkdirSync(join(dir, "topics"))
    const target = join(dir, "static/contentIndex.json")
    const manifest = join(dir, "groups.json")
    writeFileSync(target, JSON.stringify(input))
    writeFileSync(manifest, JSON.stringify({ version: 1, groups }))
    if (html !== null) writeFileSync(join(dir, `${route}.html`), html)
    const result = spawnSync(process.execPath, [script, target, "180", "120", "4", "8", manifest], {
      encoding: "utf8",
    })
    return {
      ...result,
      search: JSON.parse(readFileSync(target)),
      graph: existsSync(join(dir, "static/graphIndex.json"))
        ? JSON.parse(readFileSync(join(dir, "static/graphIndex.json")))
        : null,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("CLI consolidates only search, preserves every alias and graph byte-equivalent data", () => {
  const baseline = run(source, [])
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.graph, baseline.graph)
  assert.deepEqual(result.search["entities/singleton"], baseline.search["entities/singleton"])
  assert.deepEqual(result.search["readings/1-1"], baseline.search["readings/1-1"])
  for (let i = 0; i < labels.length; i++)
    assert.equal(result.search[`entities/member-${i}`], undefined)
  assert.equal(result.search[route].title, group.label)
  for (const label of labels) assert.ok(result.search[route].content.includes(label))
  assert.ok(result.search[route].content.indexOf("Zymographic") > 180)
  assert.deepEqual(result.search[route].tags, [])
  assert.doesNotMatch(result.search[route].content, /transcript|payload/)
})

for (const [name, input, groups, html, error] of [
  [
    "missing exact member",
    source,
    [{ ...group, sources: ["entities/exact 0.md", "entities/Exact 1.md"] }],
    undefined,
    /missing.*entities\/exact 0.md/i,
  ],
  [
    "ambiguous filePath",
    { ...source, "entities/duplicate": source["entities/member-0"] },
    [group],
    undefined,
    /ambiguous/i,
  ],
  [
    "single-member group",
    source,
    [{ ...group, sources: [group.sources[0]] }],
    undefined,
    /invalid topic group/i,
  ],
  [
    "non-flat source path",
    {
      ...source,
      "entities/member-0": {
        ...source["entities/member-0"],
        filePath: "entities/nested/../Exact 0.md",
      },
    },
    [{ ...group, sources: ["entities/nested/../Exact 0.md", ...group.sources.slice(1)] }],
    undefined,
    /invalid topic source/i,
  ],
  ["duplicate group ID", source, [group, group], undefined, /duplicate|collision/i],
  ["invalid group ID", source, [{ ...group, id: "Bad_ID" }], undefined, /invalid.*id/i],
  [
    "multiply owned member",
    source,
    [group, { ...group, id: "other" }],
    undefined,
    /owned|multiple|duplicate/i,
  ],
  [
    "route collision",
    { ...source, [route]: { title: "Existing" } },
    [group],
    undefined,
    /collision/i,
  ],
  ["missing HTML", source, [group], null, /HTML|ENOENT/i],
  ["wrong data-slug", source, [group], '<body data-slug="topics/wrong"></body>', /data-slug/i],
])
  test(`CLI fails closed: ${name}`, () => {
    const result = run(input, groups, html)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, error)
    assert.deepEqual(result.search, input, "failure must not overwrite the full index")
    assert.equal(result.graph, null)
  })

test("real installed lazy FlexSearch indexes late aliases to the canonical route only", async (t) => {
  const pkg = new URL("../node_modules/@quartz-community/search/dist/index.js", import.meta.url)
  if (!existsSync(pkg)) return t.skip("Installed Quartz search package unavailable")
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const packaged = searchFixture()
  const literal = packaged.match(/var search_inline_default = (`[\s\S]*?`);/)[1]
  const runtime = new Function("return " + literal)().replace(
    /import\.meta/g,
    '({url:"https://example.test/search.js",dirname:"/"})',
  )
  assert.match(runtime, /cayceSearchInitPromise/)
  const harness = new Function(
    "document",
    "window",
    "DOMParser",
    "fetchData",
    runtime + "; return { init: Ti, index: le, slugs: Ht };",
  )({ addEventListener() {} }, { addCleanup() {} }, class {}, Promise.resolve(result.search))
  await harness.init()
  for (const alias of labels) {
    const hits = await harness.index.searchAsync(alias)
    const slugs = [...new Set(hits.flatMap((hit) => hit.result.map((id) => harness.slugs[id])))]
    assert.deepEqual(slugs, [route], alias)
  }
})
