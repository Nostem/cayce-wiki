import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { VFile } from "vfile"
import { parse as yaml } from "yaml"
import { slugifyFilePath as oldRoute } from "@quartz-community/utils"
import { ObsidianFlavoredMarkdown as OFM } from "@quartz-community/obsidian-flavored-markdown"
import { createMdProcessor } from "../processors/parse"
import { sourceRoute, sourceRouteMap, sourceRouteCollisions } from "./sourceRoutes"
import { LibraryCatalog } from "../../plugins/library-catalog/src/index"
import type { BuildCtx } from "./ctx"
import type { ProcessedContent } from "../plugins/vfile"

test("all 42 historical winners remain canonical; other identities roundtrip", () => {
  assert.equal(sourceRouteCollisions.length, 42)
  for (const row of sourceRouteCollisions) {
    assert.equal(sourceRoute(row.winner), row.canonical)
    assert.equal(sourceRoute(row.source), row.route)
    assert.equal(sourceRoute(row.route), row.route)
    assert.notEqual(row.route, row.canonical)
    assert.ok(
      row.route.endsWith(createHash("sha256").update(row.source).digest("hex").slice(0, 12)),
    )
  }
  assert.throws(
    () => sourceRouteMap(["entities/new name.md", "entities/new-name.md"]),
    /Duplicate source output/,
  )
})

test("real packaged OFM preserves labels, aliases, anchors and code while resolving both identities", async () => {
  const ctx = {
    cfg: { plugins: { transformers: [OFM()] } },
    allSlugs: [],
    argv: {},
  } as unknown as BuildCtx
  const processor = createMdProcessor(ctx)
  for (const row of sourceRouteCollisions) {
    for (const source of [row.source, row.winner]) {
      const target = source.replace(/\.md$/, "")
      const file = new VFile(
        `[[${target}]] [[${target}|Exact words]] [[${target}#Section|Anchor words]] \`${"[[" + target + "]]"}\``,
      )
      file.data.slug = "readings/test" as never
      const tree = await processor.run(processor.parse(file), file)
      const children = (tree.children[0] as any).children
      const links = children.filter((node: any) => node.type === "link")
      assert.deepEqual(
        links.map((node: any) => node.url),
        [sourceRoute(source), sourceRoute(source), sourceRoute(source) + "#section"],
      )
      assert.deepEqual(
        links.map((node: any) => node.children[0].value),
        [target, "Exact words", "Anchor words"],
      )
      assert.equal(children.find((node: any) => node.type === "inlineCode").value, `[[${target}]]`)
    }
  }
})

test("full source coverage, all memberships, immutable bytes and distinct known pairs", () => {
  // Exact Git spelling is authoritative: macOS can retain an earlier filename's case.
  const tracked = execFileSync("git", [
    "ls-files",
    "-z",
    "content/readings",
    "content/entities",
    "content/series",
  ])
    .toString()
    .split("\0")
    .filter((p) => p.endsWith(".md") && !p.endsWith("/index.md"))
  const paths = tracked.map((p) => p.slice(8))
  assert.equal(paths.length, 25056)
  assert.equal(paths.filter((p) => p.startsWith("entities/")).length, 10731)
  const routes = sourceRouteMap(paths)
  assert.equal(routes.size, 25056)
  const before = new Map<string, string>()
  const content: ProcessedContent[] = paths.map((relative) => {
    const path = `content/${relative}`
    const bytes = fs.readFileSync(path)
    before.set(path, createHash("sha256").update(bytes).digest("hex"))
    const source = bytes.toString()
    const fm = yaml(source.match(/^---\r?\n([\s\S]*?)\r?\n---/)![1])
    const file = new VFile(source)
    file.data = {
      slug: routes.get(relative),
      relativePath: relative,
      filePath: path,
      frontmatter: fm,
    } as never
    if (!sourceRouteCollisions.some((row) => row.source === relative))
      assert.equal(file.data.slug, oldRoute(relative as never))
    return [{ type: "root", children: [] }, file]
  })
  for (const [name, count] of [
    ["Johns Hopkins", 26],
    ["Johns-Hopkins", 7],
    ["cocoa butter massage", 76],
    ["cocoa-butter massage", 3],
  ] as const) {
    const row = content.find(
      ([, file]) =>
        String(file.data.relativePath).toLowerCase() === `entities/${name}.md`.toLowerCase(),
    )!
    assert.equal(row[1].data.frontmatter?.reading_count, count)
  }
  const plugin = LibraryCatalog()
  const pages = plugin.generate!({ content } as never)
  assert.equal(new Set(pages.map((p) => p.slug)).size, pages.length)
  for (const row of sourceRouteCollisions) {
    for (const source of [row.source, row.winner]) {
      const file = content.find(
        ([, f]) => String(f.data.relativePath).toLowerCase() === source.toLowerCase(),
      )![1]
      assert.equal(file.data.libraryCatalog, true)
      assert.ok(plugin.match({ slug: sourceRoute(source) } as never))
    }
  }
  for (const [path, hash] of before)
    assert.equal(createHash("sha256").update(fs.readFileSync(path)).digest("hex"), hash, path)
  assert.throws(
    () => LibraryCatalog().generate!({ content: content.slice(1) } as never),
    /Source coverage/,
  )
  assert.throws(
    () =>
      LibraryCatalog({ verifyCorpus: false }).generate!({
        content: [content[0], content[0]],
      } as never),
    /Duplicate source output/,
  )
  console.log(
    JSON.stringify({
      sources: paths.length,
      entities: 10731,
      uniqueRoutes: routes.size,
      validatedMembershipSources: 10750,
      virtualPages: pages.length,
      unchangedBytes: before.size,
    }),
  )
})
