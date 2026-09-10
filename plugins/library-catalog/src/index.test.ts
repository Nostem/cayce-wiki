import test from "node:test"
import assert from "node:assert/strict"
import { h } from "preact"
import render from "preact-render-to-string"
import { VFile } from "vfile"
import { LibraryCatalog } from "./index"
import type { ProcessedContent } from "../../../quartz/plugins/vfile"

function file(slug: string, fm: Record<string, unknown>, source = ""): ProcessedContent {
  const f = new VFile(source)
  f.data = { slug, frontmatter: { title: slug, tags: [], ...fm } } as unknown as typeof f.data
  return [{ type: "root", children: [] }, f]
}
test("pageType generates bounded no-JS catalogs with natural order and meaningful labels", () => {
  const plugin = LibraryCatalog({ verifyCorpus: false })
  const content = Array.from({ length: 85 }, (_, i) =>
    file(
      `readings/${i + 1}-1`,
      { reading: `${i + 1}-1`, year: 1938, tags: ["reading", "year/1938"] },
      "Date: 4/8/1938  Sex: M",
    ),
  )
  content.push(
    file(
      "entities/1005--0477d720",
      { entity: "1005", reading_count: 2, entity_types: ["person"] },
      "[[1-1]], [[2-1]]",
    ),
  )
  const generated = plugin.generate!({ content } as never)
  assert.ok(generated.every((p) => p.data.unlisted === true))
  assert.ok(generated.some((p) => p.slug === "readings/page/3"))
  assert.ok(generated.some((p) => p.slug === "tags/year/1938/index"))
  const Body = plugin.body(undefined)
  const html = render(h(Body, { fileData: { slug: "readings/index" } } as never))
  assert.equal((html.match(/class="catalog-row"/g) ?? []).length, 40)
  assert.ok(html.indexOf("Reading 2-1") < html.indexOf("Reading 10-1"))
  assert.match(html, /1–40 of 85 records/)
  assert.match(html, /Next page/)
  assert.match(html, /without JavaScript/)
  const last = render(h(Body, { fileData: { slug: "readings/page/3" } } as never))
  assert.equal((last.match(/class="catalog-row"/g) ?? []).length, 5)
  const entity = render(h(Body, { fileData: { slug: "entities/1005--0477d720" } } as never))
  assert.match(entity, /1005:/)
  assert.doesNotMatch(entity, /1005--0477d720:/)
})
test("existing catalog shells are excluded from membership and retitled", () => {
  const plugin = LibraryCatalog({ verifyCorpus: false })
  const shell = file("entities/index", { title: "Entities (999999)" })
  const content = [file("readings/1-1", { reading: "1-1" }), shell]
  plugin.generate!({ content } as never)
  assert.equal(shell[1].data.frontmatter?.title, "Explore topics")
  const Body = plugin.body(undefined)
  assert.match(
    render(h(Body, { fileData: { slug: "entities/index" } } as never)),
    /0–0 of 0 records/,
  )
})
