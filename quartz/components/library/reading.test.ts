import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { parse } from "yaml"
import type { Root, Element } from "hast"
import { readingIdentity, readerTree, sourceText } from "./reading"

const p = (value: string): Element => ({
  type: "element",
  tagName: "p",
  properties: {},
  children: [{ type: "text", value }],
})
test("unknown historical date stays unknown even with file dates and correspondence", () => {
  const tree: Root = { type: "root", children: [p("Report: 1/1/1940")] }
  assert.equal(
    readingIdentity(
      tree,
      { reading: "1-1", date: "2026-09-09", modified: "2026-09-09", year: 1940 },
      "readings/1-1",
    ).originalDate,
    undefined,
  )
})
test("duplicate-source identifiers are not normalized; an explicit original date is retained verbatim", () => {
  const result = readingIdentity(
    { type: "root", children: [] } as Root,
    { reading: "1-1--0477d720", original_date: "1938?" },
    "readings/1-1--0477d720",
  )
  assert.equal(result.reading, "1-1--0477d720")
  assert.equal(result.originalDate, "1938?")
})
test("exact generated chrome is removed, near matches and source wording survive", () => {
  const title: Element = { ...p("TEXT OF READING 1-1"), tagName: "h1" }
  const duplicate = p("Reading 1-1 · Series: 1 · Year: 1938 · Sex: M")
  const tree: Root = {
    type: "root",
    children: [
      title,
      duplicate,
      p("Reading 1-1 · Series: 1 · Year: 1938 · Sex: M extra source words"),
    ],
  }
  const before = JSON.stringify(tree)
  const result = readerTree(
    tree,
    { reading: "1-1", series: "1", year: 1938, sex: "M" },
    "readings/1-1",
  ) as Root
  assert.equal(result.children.length, 2)
  assert.match(sourceText(result), /extra source words/)
  assert.equal(JSON.stringify(tree), before)
  assert.equal((result.children[0] as Element).tagName, "h2")
})
for (const id of ["1527-2", "1-1"])
  test(`real ${id} transcript is unchanged except exact generated identity row`, async () => {
    const raw = readFileSync(new URL(`../../../content/readings/${id}.md`, import.meta.url), "utf8")
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!
    const metadata = parse(match[1])
    const processor = unified().use(remarkParse).use(remarkRehype)
    const tree = (await processor.run(processor.parse(match[2]))) as Root
    const before = JSON.stringify(tree)
    const result = readerTree(tree, metadata, `readings/${id}`)
    assert.equal(JSON.stringify(tree), before)
    assert.ok(sourceText(result).includes("TEXT OF READING"))
    assert.equal(sourceText(result), sourceText(tree)) // raw wikilinks do not prove generated-row equality; fail closed
    assert.ok(readingIdentity(tree, metadata, `readings/${id}`).originalDate)
    if (id === "1-1")
      assert.match(
        readingIdentity(tree, metadata, `readings/${id}`).originalDate!,
        /approximate; exact date unknown/,
      )
  })
