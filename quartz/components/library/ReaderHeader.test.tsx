import test from "node:test"
import assert from "node:assert/strict"
import { render } from "preact-render-to-string"
import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { Fragment, jsx, jsxs } from "preact/jsx-runtime"
import { DefaultFrame } from "../frames/DefaultFrame"
import type { PageFrameProps } from "../frames/types"
import type { Root } from "hast"
import type { QuartzComponentProps } from "../types"
import { readFileSync, readdirSync } from "node:fs"
import { parse } from "yaml"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { ReaderHeader, ReaderEndMatter } from "./ReaderHeader"
import { catalogRecord } from "./catalog"
import { readingIdentity } from "./reading"

const readingsDirectory = new URL("../../../content/readings/", import.meta.url)
const duplicateSources = readdirSync(readingsDirectory)
  .filter((name) => /_id\d+\.md$/.test(name))
  .sort()
test("all eight actual duplicate sources have distinct catalog links, mastheads and citations without changing historical identity", async () => {
  assert.equal(duplicateSources.length, 8)
  const labels = new Set<string>()
  const targets = new Set<string>()
  for (const name of duplicateSources) {
    const url = new URL(name, readingsDirectory)
    const bytes = readFileSync(url)
    const match = bytes.toString("utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!
    const frontmatter = parse(match[1])
    const originalMetadata = JSON.stringify(frontmatter)
    const id = name.slice(0, -3)
    const slug = `readings/${id}`
    assert.equal(frontmatter.reading, id.replace(/_id\d+$/, ""))
    const processor = unified().use(remarkParse).use(remarkRehype)
    const tree = (await processor.run(processor.parse(match[2]))) as Root
    const expected = `${frontmatter.reading} (source record ${id})`
    const record = catalogRecord({ slug, frontmatter }, match[2])
    assert.equal(record.label, expected)
    assert.equal(record.slug, slug)
    labels.add(record.label)
    targets.add(record.slug)
    const identity = readingIdentity(tree, frontmatter, slug)
    assert.equal(identity.reading, frontmatter.reading)
    assert.equal(identity.title, `Reading ${expected}`)
    const props = { tree, fileData: { slug, frontmatter } } as unknown as QuartzComponentProps
    assert.ok(render(<ReaderHeader {...props} />).includes(`<h1>Reading ${expected}</h1>`))
    assert.ok(render(<ReaderEndMatter {...props} />).includes(`Edgar Cayce, Reading ${expected}`))
    assert.equal(JSON.stringify(frontmatter), originalMetadata)
    assert.deepEqual(readFileSync(url), bytes)
  }
  assert.equal(labels.size, 8)
  assert.equal(targets.size, 8)
})
test("normal reading catalog, masthead and citation labels remain unchanged", () => {
  assert.equal(
    catalogRecord({ slug: "readings/1527-2", frontmatter: { reading: "1527-2" } }).label,
    "1527-2",
  )
  const html = frame()
  assert.match(html, /<h1>Reading 1527-2<\/h1>/)
  assert.match(html, /Edgar Cayce, Reading 1527-2, 4\/8\/1938/)
  assert.doesNotMatch(html, /source record/)
})

const tree: Root = {
  type: "root",
  children: [
    {
      type: "element",
      tagName: "h1",
      properties: { id: "source-title" },
      children: [{ type: "text", value: "TEXT OF READING 1527-2 M 19" }],
    },
    {
      type: "element",
      tagName: "h2",
      properties: { id: "text" },
      children: [{ type: "text", value: "Text" }],
    },
    {
      type: "element",
      tagName: "p",
      properties: {},
      children: [{ type: "text", value: "Date: 4/8/1938  Sex: M  Age: 19  ReadingID: 7447" }],
    },
    {
      type: "element",
      tagName: "p",
      properties: {},
      children: [{ type: "text", value: "1. EC: Yes." }],
    },
  ],
}
function frame() {
  return render(
    DefaultFrame.render({
      componentData: {
        tree,
        fileData: {
          slug: "readings/1527-2",
          frontmatter: {
            title: "1527-2",
            reading: "1527-2",
            summary: "Generated synopsis.",
            reading_id: 7447,
          },
        },
        cfg: {},
        allFiles: [],
      },
      header: [],
      beforeBody: [],
      afterBody: [],
      left: [],
      right: [() => <div class="graph">Graph trigger</div>],
      footer: [],
      pageBody: (props: QuartzComponentProps) => (
        <article>{toJsxRuntime(props.tree as Root, { Fragment, jsx, jsxs })}</article>
      ),
    } as unknown as PageFrameProps),
  )
}
test("reader frame has a focused skip path, one masthead and retained archival words", () => {
  const html = frame()
  assert.match(html, /href="#main-content"/)
  assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/)
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1)
  assert.match(html, /TEXT OF READING 1527-2 M 19/)
  assert.match(html, /1\. EC: Yes\./)
  assert.equal(tree.children[0].type === "element" && tree.children[0].tagName, "h1")
})
test("historical identity, optional synopsis, section links and research remain accessible", () => {
  const html = frame()
  assert.match(html, /Original date: 4\/8\/1938/)
  assert.match(html, /Generated synopsis/)
  assert.match(html, /On this page/)
  assert.match(html, /href="#text"/)
  assert.match(html, /Citation and provenance/)
  assert.match(html, /Technical properties/)
  assert.match(html, /Research tools/)
  assert.match(html, /Graph trigger/)
  assert.doesNotMatch(html, /<details[^>]*\bopen/)
})
