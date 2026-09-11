import test from "node:test"
import assert from "node:assert/strict"
import { h } from "preact"
import render from "preact-render-to-string"
import { VFile } from "vfile"
import { LibraryCatalog } from "./index"
import { sourceRoute } from "../../../quartz/util/sourceRoutes"
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
test("combined catalog renders root, types, originals, bounded sources and both reading orders", () => {
  const sources = Array.from({ length: 41 }, (_, i) => `entities/Term ${i}.md`)
  const plugin = LibraryCatalog({
    verifyCorpus: false,
    topicGroups: [
      {
        id: "activity",
        label: "Activity",
        kind: "umbrella",
        reason: "Related source terms",
        sources,
      },
    ],
  })
  const content = Array.from({ length: 41 }, (_, i) =>
    file(`readings/${i + 1}-1`, { reading: `${i + 1}-1` }, `Date: 1/1/${1900 + i}`),
  )
  for (const [i, source] of sources.entries()) {
    const entry = file(
      sourceRoute(source),
      {
        title: `Term ${i}`,
        entity: `Term ${i}`,
        reading_count: 2,
        entity_types: ["concept"],
        tags: ["topic"],
      },
      `[[1-1]] [[${i === 0 ? 2 : i + 1}-1]]`,
    )
    entry[1].data.relativePath = source as never
    content.push(entry)
  }
  const generated = plugin.generate!({ content } as never)
  assert.ok(
    generated
      .filter((p) => p.slug.startsWith("topics/"))
      .every((p) => p.data.unlisted === true && p.data.libraryCatalog === true),
  )
  const Body = plugin.body(undefined)
  const html = (slug: string) => render(h(Body, { fileData: { slug } } as never))
  for (const slug of ["entities/index", "catalog/entity-types/concept"]) {
    assert.equal((html(slug).match(/class="catalog-row"/g) ?? []).length, 1)
    assert.match(html(slug), /41 readings/)
    assert.match(html(slug), /41 source terms/)
  }
  assert.match(html("topics/activity"), /41 readings from 41 original source terms/)
  assert.match(
    html("topics/activity"),
    /Related terms are grouped for browsing, not treated as identical/,
  )
  assert.doesNotMatch(html("topics/activity"), /Reviewed fixture/)
  assert.equal((html("topics/activity").match(/class="topic-source"/g) ?? []).length, 8)
  assert.match(html("topics/activity"), /View all 41 source terms/)
  assert.equal(
    (html("topics/activity/source-terms").match(/class="catalog-row"/g) ?? []).length,
    40,
  )
  const last = html("topics/activity/source-terms/page/2")
  assert.equal((last.match(/class="catalog-row"/g) ?? []).length, 1)
  assert.match(last, /First page/)
  assert.match(last, /Previous page/)
  assert.match(html("topics/activity/by-date/page/2"), /41–41 of 41 records/)
  assert.match(html("topics/activity/page/2"), /41–41 of 41 records/)
  assert.equal((html("topics/activity/page/2").match(/class="topic-source"/g) ?? []).length, 0)
  assert.match(html(sourceRoute(sources[0])), /View combined topic: Activity/)
  assert.match(html(sourceRoute(sources[0])), /1–2 of 2 records/)
  assert.equal(content[41][1].data.frontmatter?.title, "Term 0")
  assert.match(html("tags/topic/index"), /Source-record catalog/)
  assert.equal((html("tags/topic/index").match(/class="catalog-row"/g) ?? []).length, 40)
})

for (const [id, label] of [
  ["acidity-and-alkalinity", "Acidity and alkalinity"],
  ["activity", "Activity"],
  ["adhesions", "Adhesions"],
  ["affirmations", "Affirmations"],
]) {
  for (const size of [0, 2, 40])
    test(`${label}: bounded combined collection of ${size} readings`, () => {
      const sources = ["entities/Variant A.md", "entities/Variant B.md"]
      const plugin = LibraryCatalog({
        verifyCorpus: false,
        topicGroups: [{ id, label, kind: "equivalent", reason: "Reviewed fixture", sources }],
      })
      const content = Array.from({ length: size }, (_, i) =>
        file(`readings/${i + 1}-1`, { reading: `${i + 1}-1` }),
      )
      for (const source of sources) {
        const entity = file(
          sourceRoute(source),
          { entity: source.slice(9, -3), reading_count: size },
          content
            .map((_, i) => `[[${i + 1}-1]]`)
            .slice(0, size)
            .join(" "),
        )
        entity[1].data.relativePath = source as never
        content.push(entity)
      }
      const generated = plugin.generate!({ content } as never)
      assert.ok(generated.some((page) => page.slug === `topics/${id}`))
      assert.ok(!generated.some((page) => page.slug === `topics/${id}/by-date/page/1`))
      const html = render(
        h(plugin.body(undefined), { fileData: { slug: `topics/${id}` } } as never),
      )
      assert.equal((html.match(/class="catalog-row"/g) ?? []).length, size)
      assert.equal((html.match(/class="topic-source"/g) ?? []).length, 2)
      assert.match(html, /Alternate names are combined for browsing/)
      assert.doesNotMatch(html, /Reviewed fixture/)
    })
}

test("topic routes cannot shadow source or alias outputs", () => {
  for (const alias of [false, true]) {
    const plugin = LibraryCatalog({
      verifyCorpus: false,
      topicGroups: [
        {
          id: "activity",
          label: "Activity",
          kind: "equivalent",
          reason: "Fixture",
          sources: ["entities/a.md", "entities/b.md"],
        },
      ],
    })
    const content = [
      file("entities/a", { entity: "a", reading_count: 0 }),
      file("entities/b", { entity: "b", reading_count: 0 }),
    ]
    const occupied = file(alias ? "other" : "topics/activity", {})
    if (alias) occupied[1].data.aliases = ["topics/activity"] as never
    content.push(occupied)
    assert.throws(() => plugin.generate!({ content } as never), /Colliding topic route/)
  }
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
