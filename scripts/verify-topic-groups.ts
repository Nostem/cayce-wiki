import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { fromHtml } from "hast-util-from-html"
import type { Element, Root, RootContent } from "hast"
import { parse } from "yaml"
import { VFile } from "vfile"
import { h } from "preact"
import render from "preact-render-to-string"
import { LibraryCatalog } from "../plugins/library-catalog/src/index"
import recovered from "../plugins/library-catalog/data/complete-memberships.json"
import manifest from "../plugins/library-catalog/data/topic-groups.json"
import { sourceRoute, sourceRouteMap } from "../quartz/util/sourceRoutes"
import {
  catalogRecord,
  compareCatalog,
  paginate,
  verifyMembership,
  type CatalogRecord,
  type CatalogSort,
} from "../quartz/components/library/catalog"
import { buildTopicGroups, parseTopicManifest } from "../quartz/components/library/topics"
import type { ProcessedContent } from "../quartz/plugins/vfile"

export interface ExpectedCatalogPage {
  slug: string
  targets: string[]
  total: number
  start: number
  end: number
}
function elements(node: Root | RootContent, predicate: (element: Element) => boolean): Element[] {
  const found: Element[] = []
  if (node.type === "element" && predicate(node)) found.push(node)
  if ("children" in node)
    for (const child of node.children) found.push(...elements(child, predicate))
  return found
}
const hasClass = (node: Element, name: string) =>
  Array.isArray(node.properties.className) && node.properties.className.includes(name)
function text(node: RootContent): string {
  return node.type === "text"
    ? node.value
    : "children" in node
      ? node.children.map(text).join("")
      : ""
}
/** Inspect only actual catalog row heading links, not navigation or source previews. */
export function assertCatalogPage(html: string, expected: ExpectedCatalogPage): void {
  const { slug } = expected
  const tree = fromHtml(html)
  assert.equal(
    elements(
      tree,
      (n) => n.tagName === "meta" && String(n.properties.httpEquiv).toLowerCase() === "refresh",
    ).length,
    0,
    `${slug}: source replaced by redirect`,
  )
  const bodies = elements(tree, (n) => n.tagName === "body")
  assert.equal(bodies[0]?.properties.dataSlug, slug, `${slug}: wrong rendered source identity`)
  const mains = elements(tree, (n) => n.tagName === "main")
  assert.equal(mains.length, 1, `${slug}: missing source main`)
  const catalogs = elements(mains[0], (n) => hasClass(n, "library-catalog"))
  assert.equal(catalogs.length, 1, `${slug}: expected one catalog body`)
  const lists = elements(catalogs[0], (n) => n.tagName === "ol" && hasClass(n, "catalog-rows"))
  assert.equal(lists.length, 1, `${slug}: expected one row list`)
  const rows = lists[0].children.filter((n): n is Element => n.type === "element")
  assert.ok(
    rows.every((n) => n.tagName === "li" && hasClass(n, "catalog-row")),
    `${slug}: unexpected row markup`,
  )
  assert.ok(rows.length <= 40, `${slug}: exceeds 40 rows`)
  assert.equal(rows.length, expected.targets.length, `${slug}: row count mismatch`)
  const targets = rows.map((row, index) => {
    const headings = elements(row, (n) => n.tagName === "h3")
    assert.equal(headings.length, 1, `${slug}: row ${index + 1} heading mismatch`)
    const links = elements(headings[0], (n) => n.tagName === "a")
    assert.equal(links.length, 1, `${slug}: row ${index + 1} target count mismatch`)
    const url = new URL(String(links[0].properties.href), `https://verify.invalid/${slug}`)
    assert.equal(url.origin, "https://verify.invalid", `${slug}: external row target`)
    assert.equal(url.search + url.hash, "", `${slug}: row target has query/fragment`)
    return decodeURIComponent(url.pathname.slice(1)).replace(/\.html$/, "")
  })
  assert.equal(new Set(targets).size, targets.length, `${slug}: duplicate row target`)
  assert.deepEqual(targets, expected.targets, `${slug}: row targets/order mismatch`)
  const counts = elements(catalogs[0], (n) => hasClass(n, "catalog-count"))
  assert.equal(counts.length, 1, `${slug}: missing record count`)
  const count = /^(\d+)–(\d+) of ([\d,]+) records$/.exec(text(counts[0]).trim())
  assert.ok(count, `${slug}: malformed record count`)
  assert.deepEqual(
    count.slice(1).map((v) => Number(v.replaceAll(",", ""))),
    [expected.start, expected.end, expected.total],
    `${slug}: record count mismatch`,
  )
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
function inventory(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "-z", "content/readings", "content/entities", "content/series"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  )
    .toString()
    .split("\0")
    .filter(Boolean)
}
function digest(files: string[]): string {
  const hash = createHash("sha256")
  for (const file of files)
    hash
      .update(file)
      .update("\0")
      .update(readFileSync(path.join(root, file)))
      .update("\0")
  return hash.digest("hex")
}
function htmlInventory(directory: string, prefix = "topics"): string[] {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}/${entry.name}`
    return entry.isDirectory()
      ? htmlInventory(directory, name)
      : name.endsWith(".html")
        ? [name.slice(0, -5)]
        : []
  })
}
export function verifyCatalogOutput(
  output: string,
  expected: ReadonlyMap<string, ExpectedCatalogPage>,
): void {
  for (const page of expected.values()) {
    const filename = path.join(output, `${page.slug}.html`)
    let html: string
    try {
      html = readFileSync(filename, "utf8")
    } catch (error) {
      throw new Error(`${page.slug}: missing/unreadable emitted page`, { cause: error })
    }
    assertCatalogPage(html, page)
  }
  const topicSlugs = [...expected.keys()].filter((slug) => slug.startsWith("topics/"))
  assert.deepEqual(
    htmlInventory(output).sort(),
    topicSlugs.sort(),
    "emitted topic inventory mismatch (missing/extra pages)",
  )
}
/** Full model is cached once; output checks never reconstruct corpus per page. */
export function verifyTopicGroups(output?: string) {
  const files = inventory()
  const before = digest(files)
  for (const [kind, count] of Object.entries({ readings: 14306, entities: 10731, series: 19 }))
    assert.equal(
      files.filter((file) => file.startsWith(`content/${kind}/`)).length,
      count,
      `source coverage ${kind}`,
    )
  assert.equal(files.length, 25056, "source identity count")
  const routes = sourceRouteMap(files.map((file) => file.slice(8)))
  const content: ProcessedContent[] = []
  const entities = new Map<string, CatalogRecord>()
  const readings = new Map<string, CatalogRecord>()
  const rawEntities = new Map<string, string>()
  const memberships = new Map<string, string[]>()
  for (const file of files) {
    const relativePath = file.slice(8)
    const raw = readFileSync(path.join(root, file), "utf8")
    const yaml = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
    assert.ok(yaml, `${relativePath}: missing YAML frontmatter`)
    const frontmatter = parse(yaml[1])
    const vfile = new VFile(raw)
    vfile.data = {
      slug: routes.get(relativePath),
      relativePath,
      filePath: path.join(root, file),
      frontmatter,
    } as unknown as typeof vfile.data
    content.push([{ type: "root", children: [] }, vfile])
    const record = catalogRecord(vfile.data, raw)
    if (record.kind === "readings") readings.set(record.slug.slice(9), record)
    if (record.kind === "entities") {
      entities.set(relativePath, record)
      rawEntities.set(record.slug, raw)
    }
  }
  // Recovery keys preserve source names, including three documented historical case spellings.
  // Resolve both sides through sourceRoute, never filesystem casing or bare normalization.
  const recovery = new Map<string, string[]>()
  for (const [key, ids] of Object.entries(recovered)) {
    const slug = sourceRoute(`${key}.md`)
    assert.ok(!recovery.has(slug), `duplicate recovery route ${slug}`)
    recovery.set(slug, ids)
  }
  const available = new Set(readings.keys())
  for (const [source, row] of entities) {
    const prefix = [...rawEntities.get(row.slug)!.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(
      (m) => m[1].replace(/^readings\//, ""),
    )
    assert.equal(typeof row.count, "number", `${source}: missing declared membership count`)
    const ids = verifyMembership(source, recovery.get(row.slug) ?? prefix, row.count!, available)
    const checked = new Set(ids)
    assert.ok(
      prefix.every((id) => checked.has(id)),
      `${source}: recovered membership disagrees with source links`,
    )
    memberships.set(row.slug, ids)
  }
  const definitions = parseTopicManifest(manifest)
  const model = buildTopicGroups(
    definitions,
    entities,
    memberships,
    readings,
    new Set(routes.values()),
  )
  const directory = model.project([...entities.values()])
  const owned = definitions.flatMap((group) => group.sources)
  assert.equal(new Set(owned).size, owned.length, "multiply owned source")
  assert.equal(
    directory.length,
    entities.size - owned.length + definitions.length,
    "directory row count",
  )
  const directoryRoutes = new Set(directory.map((row) => row.slug))
  assert.equal(directoryRoutes.size, directory.length, "duplicate directory row")
  const groupsByRoute = new Map(model.groups.map((group) => [group.row.slug, group]))
  const expanded = directory.flatMap((row) =>
    row.kind === "topics"
      ? groupsByRoute.get(row.slug)!.sources.map((source) => source.slug)
      : [row.slug],
  )
  assert.equal(new Set(expanded).size, entities.size, "directory source coverage")
  assert.equal(expanded.length, entities.size, "directory source represented more than once")
  assert.deepEqual(
    new Set(expanded),
    new Set([...entities.values()].map((row) => row.slug)),
    "directory source identity mismatch",
  )
  const expected = new Map<string, ExpectedCatalogPage>()
  function collection(base: string, rows: CatalogRecord[]) {
    const sorts: CatalogSort[] =
      rows.length > 40 && rows.some((row) => row.kind === "readings") ? ["id", "date"] : ["id"]
    for (const sort of sorts) {
      const sorted = [...rows].sort(compareCatalog(sort))
      for (let page = 1; page <= paginate(sorted).pages; page++) {
        let slug: string
        if (sort === "date") slug = `${base}/by-date/page/${page}`
        else if (page > 1) slug = `${base}/page/${page}`
        else slug = base === "entities" ? "entities/index" : base
        const result = paginate(sorted, page)
        assert.ok(!expected.has(slug), `duplicate expected page ${slug}`)
        expected.set(slug, {
          slug,
          targets: result.rows.map((row) => row.slug),
          total: result.total,
          start: result.start,
          end: result.end,
        })
      }
    }
  }
  collection("entities", directory)
  for (const group of model.groups) {
    collection(group.row.slug, group.readings)
    if (group.sources.length > 8) collection(`${group.row.slug}/source-terms`, group.sources)
  }
  const plugin = LibraryCatalog({ verifyCorpus: true })
  const virtual = plugin.generate!({ content } as never)
  const topicSlugs = [...expected.keys()].filter((slug) => slug.startsWith("topics/"))
  assert.deepEqual(
    virtual
      .filter((page) => page.slug.startsWith("topics/"))
      .map((page) => page.slug)
      .sort(),
    [...topicSlugs].sort(),
    "real generator topic inventory mismatch",
  )
  const Body = plugin.body(undefined)
  if (output) verifyCatalogOutput(output, expected)
  else
    for (const page of expected.values()) {
      const html = `<html><body data-slug="${page.slug}"><main>${render(h(Body, { fileData: { slug: page.slug } } as never))}</main></body></html>`
      assertCatalogPage(html, page)
    }
  assert.deepEqual(inventory(), files, "protected source inventory modified")
  assert.equal(digest(files), before, "protected source bytes modified")
  return {
    mode: output ? "output" : "model-only",
    sources: files.length,
    readings: readings.size,
    entities: entities.size,
    groups: definitions.length,
    groupedSources: owned.length,
    singletonSources: entities.size - owned.length,
    directoryRows: directory.length,
    topicPages: topicSlugs.length,
    checkedPages: expected.size,
    sourceSha256: before,
    sourceBytesUnchanged: true,
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  let output: string | undefined
  let report: string | undefined
  let modelOnly = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model-only") modelOnly = true
    else if (args[i] === "--report" || args[i] === "--output") {
      const flag = args[i]
      const value = args[++i]
      assert.ok(value && !value.startsWith("--"), `${flag}: missing path`)
      if (flag === "--report") report = value
      else output = value
    } else {
      assert.ok(!args[i].startsWith("--") && !output, `unexpected argument: ${args[i]}`)
      output = args[i]
    }
  }
  assert.ok(!(modelOnly && output), "--model-only cannot be combined with an output directory")
  const summary = JSON.stringify(verifyTopicGroups(output), null, 2) + "\n"
  if (report) writeFileSync(report, summary)
  process.stdout.write(summary)
}
