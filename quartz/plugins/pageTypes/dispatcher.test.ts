import test, { describe } from "node:test"
import assert from "node:assert"
import { collectComponents, resolveLayout, PageTypeDispatcher } from "./dispatcher"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { h } from "preact"
import { fromHtml } from "hast-util-from-html"
import { htmlToJsx } from "../../util/jsx"
import { BuildCtx } from "../../util/ctx"
import { GlobalConfiguration } from "../../cfg"
import { FilePath, FullSlug } from "../../util/path"
import { defaultProcessedContent } from "../vfile"
import { VirtualPage } from "../types"
import { QuartzPageTypePluginInstance } from "../types"
import { QuartzComponent } from "../../components/types"

const StubA: QuartzComponent = (() => null) as unknown as QuartzComponent
const StubB: QuartzComponent = (() => null) as unknown as QuartzComponent
const StubHead: QuartzComponent = (() => null) as unknown as QuartzComponent

function makePageType(
  overrides: Partial<QuartzPageTypePluginInstance> = {},
): QuartzPageTypePluginInstance {
  return {
    name: "test-page-type",
    layout: "content",
    match: () => true,
    body: () => (() => null) as unknown as QuartzComponent,
    ...overrides,
  } as QuartzPageTypePluginInstance
}

describe("resolveLayout", () => {
  test("footer defaults to [] when sharedDefaults omits footer", () => {
    const result = resolveLayout(makePageType(), { head: StubHead }, {})
    assert.deepStrictEqual(result.footer, [])
  })

  test("header defaults to [] when sharedDefaults omits header", () => {
    const result = resolveLayout(makePageType(), { head: StubHead }, {})
    assert.deepStrictEqual(result.header, [])
  })

  test("footer from sharedDefaults is used when no override", () => {
    const result = resolveLayout(makePageType(), { head: StubHead, footer: [StubA] }, {})
    assert.deepStrictEqual(result.footer, [StubA])
  })

  test("byPageType override replaces footer", () => {
    const result = resolveLayout(
      makePageType(),
      { head: StubHead, footer: [StubA] },
      { content: { footer: [StubB] } },
    )
    assert.deepStrictEqual(result.footer, [StubB])
  })

  test("byPageType override clears footer with []", () => {
    const result = resolveLayout(
      makePageType(),
      { head: StubHead, footer: [StubA] },
      { content: { footer: [] } },
    )
    assert.deepStrictEqual(result.footer, [])
  })

  test("byPageType override clears header with []", () => {
    const result = resolveLayout(
      makePageType(),
      { head: StubHead, header: [StubA] },
      { content: { header: [] } },
    )
    assert.deepStrictEqual(result.header, [])
  })

  test("all array slots default to [] when sharedDefaults only has head", () => {
    const result = resolveLayout(makePageType(), { head: StubHead }, {})
    assert.deepStrictEqual(result.header, [])
    assert.deepStrictEqual(result.left, [])
    assert.deepStrictEqual(result.right, [])
    assert.deepStrictEqual(result.beforeBody, [])
    assert.deepStrictEqual(result.afterBody, [])
    assert.deepStrictEqual(result.footer, [])
  })

  test("preserves component references through override", () => {
    const result = resolveLayout(makePageType(), { head: StubHead, footer: [StubA, StubB] }, {})
    assert.strictEqual(result.footer[0], StubA)
    assert.strictEqual(result.footer[1], StubB)
  })
})

describe("resolveLayout frame resolution", () => {
  test("config override frame wins over page type frame", () => {
    const result = resolveLayout(
      makePageType({ frame: "minimal" }),
      { head: StubHead },
      { content: { frame: "full-width" } },
    )
    assert.strictEqual(result.frame, "full-width")
  })

  test("page type frame wins when no config override", () => {
    const result = resolveLayout(makePageType({ frame: "minimal" }), { head: StubHead }, {})
    assert.strictEqual(result.frame, "minimal")
  })

  test("defaults to 'default' when no frame specified", () => {
    const result = resolveLayout(makePageType(), { head: StubHead }, {})
    assert.strictEqual(result.frame, "default")
  })

  test("defaults to 'default' when byPageType entry exists but has no frame", () => {
    const result = resolveLayout(makePageType(), { head: StubHead }, { content: { left: [StubA] } })
    assert.strictEqual(result.frame, "default")
  })
})

describe("virtual page transclusion cache during real emission", () => {
  for (const mode of ["full", "partial"] as const) {
    test(`${mode}: emits catalog once without caching while preserving other caches and embeds`, async () => {
      const output = await mkdtemp(path.join(tmpdir(), "quartz-dispatcher-"))
      try {
        const pages: VirtualPage[] = [
          {
            slug: "library/readings/page/2",
            title: "Catalog",
            data: { unlisted: true, libraryCatalog: true },
          },
          { slug: "ordinary", title: "Ordinary", data: {} },
          { slug: "unlisted-only", title: "Unlisted", data: { unlisted: true } },
          { slug: "catalog-only", title: "Listed catalog", data: { libraryCatalog: true } },
          { slug: "board", title: "Canvas", data: {} },
          { slug: "database", title: "Base", data: {} },
          {
            slug: "false-unlisted",
            title: "False unlisted",
            data: { unlisted: false, libraryCatalog: true },
          },
          {
            slug: "false-catalog",
            title: "False catalog",
            data: { unlisted: true, libraryCatalog: false },
          },
        ]
        const renders = new Map<string, number>()
        const VirtualBody: QuartzComponent = ({ fileData }) => {
          const slug = fileData.slug!
          renders.set(slug, (renders.get(slug) ?? 0) + 1)
          return h("article", {}, `Body of ${slug}`)
        }
        const SourceBody: QuartzComponent = ({ tree }) =>
          h("article", {}, htmlToJsx("source.md" as FilePath, tree))
        const pageTypes = [
          makePageType({
            match: () => false,
            generate: () => pages,
            body: () => VirtualBody,
            frame: "minimal",
          }),
          makePageType({ body: () => SourceBody, frame: "minimal" }),
        ]
        const source = defaultProcessedContent({
          slug: "source" as FullSlug,
          filePath: "source.md" as FilePath,
          relativePath: "source.md" as FilePath,
          frontmatter: { title: "Source", tags: [] },
        })
        // Exercise extension fallback used by canvas/base embeds, not just exact slugs.
        source[0] = {
          type: "root",
          children: ["ordinary", "board.canvas", "database.base"].map((slug) => ({
            type: "element",
            tagName: "blockquote",
            properties: { className: ["transclude"] },
            children: [
              {
                type: "element",
                tagName: "a",
                properties: { "data-slug": slug, href: `./${slug}` },
                children: [{ type: "text", value: `Fallback ${slug}` }],
              },
            ],
          })),
        }
        const entityAst = fromHtml("<p>Source-backed entity content</p>", { fragment: true })
        const entity = defaultProcessedContent({
          slug: "entities/example" as FullSlug,
          filePath: "entities/example.md" as FilePath,
          relativePath: "entities/example.md" as FilePath,
          frontmatter: { title: "Entity", tags: [] },
          unlisted: true,
          libraryCatalog: true,
          htmlAst: entityAst,
        })
        entity[0] = entityAst
        const ctx: BuildCtx = {
          buildId: "dispatcher-test",
          argv: {
            directory: output,
            output,
            verbose: false,
            serve: false,
            watch: false,
            port: 8080,
            wsPort: 3001,
          },
          cfg: {
            configuration: { locale: "en-US" } as GlobalConfiguration,
            plugins: { transformers: [], filters: [], emitters: [], pageTypes },
          },
          allSlugs: [],
          allFiles: [],
          incremental: mode === "partial",
          virtualPages: [],
        }
        const dispatcher = PageTypeDispatcher({ defaults: { head: StubHead } })
        const content = [source, entity]
        const resources = { css: [], js: [], additionalHead: [] }
        const emission =
          mode === "full"
            ? dispatcher.emit(ctx, content, resources)
            : dispatcher.partialEmit!(ctx, content, resources, [
                { type: "change", path: "source.md" as FilePath, file: source[1] },
              ])
        assert.ok(emission)
        const emitted: string[] = []
        for await (const file of await emission) emitted.push(path.relative(output, file))
        const expected = [...pages.map((page) => `${page.slug}.html`), "source.html"]
        if (mode === "full") expected.push("entities/example.html")
        assert.deepStrictEqual(emitted.sort(), expected.sort())
        for (const page of pages) {
          const html = await readFile(path.join(output, `${page.slug}.html`), "utf8")
          assert.ok(html.includes(`data-slug="${page.slug}"`))
          assert.ok(html.includes(`Body of ${page.slug}`))
        }
        const sourceHtml = await readFile(path.join(output, "source.html"), "utf8")
        for (const slug of ["ordinary", "board", "database"]) {
          assert.ok(sourceHtml.includes(`Body of ${slug}`), `${slug} transclusion must resolve`)
        }
        assert.strictEqual(
          entity[1].data.htmlAst,
          entityAst,
          "source-backed cache must remain untouched",
        )
        assert.strictEqual(ctx.virtualPages.length, pages.length)
        for (const [, file] of ctx.virtualPages) {
          const slug = file.data.slug!
          if (slug === pages[0].slug) continue
          assert.ok(
            JSON.stringify(file.data.htmlAst).includes(`Body of ${slug}`),
            `${slug} cache preserved`,
          )
          assert.strictEqual(renders.get(slug), 2, `${slug} renders for cache and emission`)
        }
        const catalog = ctx.virtualPages.find(([, file]) => file.data.slug === pages[0].slug)![1]
        assert.strictEqual(
          catalog.data.htmlAst,
          undefined,
          "unlisted catalog must not retain a body HAST",
        )
        assert.strictEqual(
          renders.get(pages[0].slug),
          1,
          "catalog renders only for actual emission",
        )
      } finally {
        await rm(output, { recursive: true, force: true })
      }
    })
  }
})

describe("collectComponents", () => {
  test("collects all unique components across page types", () => {
    const pageTypes = [makePageType(), makePageType({ layout: "landing" })]
    const sharedDefaults = { head: StubHead }
    const byPageType = {
      content: { footer: [StubA] },
      landing: { footer: [StubB] },
    }

    const result = collectComponents(pageTypes, sharedDefaults, byPageType)
    assert.ok(result.includes(StubA))
    assert.ok(result.includes(StubB))
  })

  test("deduplicates shared components", () => {
    const pageTypes = [makePageType(), makePageType({ layout: "landing" })]
    const sharedDefaults = { head: StubHead }
    const byPageType = {
      content: { left: [StubA] },
      landing: { left: [StubA] },
    }

    const result = collectComponents(pageTypes, sharedDefaults, byPageType)
    const matches = result.filter((component) => component === StubA)
    assert.strictEqual(matches.length, 1)
  })

  test("handles empty footer and header arrays", () => {
    const pageTypes = [makePageType({ layout: "empty" })]
    const sharedDefaults = { head: StubHead }
    const byPageType = { empty: { footer: [], header: [] } }

    const result = collectComponents(pageTypes, sharedDefaults, byPageType)
    assert.ok(result.every((component) => component))
  })
})
