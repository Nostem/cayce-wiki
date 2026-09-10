import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import vm from "node:vm"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const trackedSources = new Set(
  execFileSync("git", ["ls-files", "-z", "content/entities"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  })
    .toString()
    .split("\0"),
)

const baseline = process.env.ALIASES_BASELINE === "1"
const patch = baseline ? null : await import("./patch-quartz-aliases.mjs")
let upstream = readFileSync(
  new URL("../node_modules/@quartz-community/alias-redirects/dist/index.js", import.meta.url),
  "utf8",
)
if (patch) upstream = patch.unpatchSource(upstream)
const collisions = JSON.parse(
  readFileSync(new URL("../quartz/util/sourceRouteCollisions.json", import.meta.url)),
).collisions
const item = (slug, relativePath, aliases = []) => [{}, { data: { slug, relativePath, aliases } }]

// Execute the WHOLE installed emitter, substituting only a deterministic output
// filesystem. Exact keys simulate Linux even on a case-insensitive macOS host.
function harness(source, sensitive) {
  const pages = new Map()
  const key = (p) => (sensitive ? path.normalize(p) : path.normalize(p).toLowerCase())
  const fs = {
    mkdir: async () => {},
    writeFile: async (p, html) => {
      pages.set(key(p), html)
    },
    access: async (p) => {
      if (!pages.has(key(p))) throw Error("ENOENT")
    },
    stat: async (p) => ({ ino: key(p) }),
    rm: async (p) => {
      for (const k of pages.keys()) if (k.startsWith(key(p))) pages.delete(k)
    },
  }
  const executable = source
    .replace(/^import .*;\n/gm, "")
    .replace(
      /export \{ AliasRedirects, _resetFsDetectionCache \};/,
      "globalThis.emitter = AliasRedirects;",
    )
  const scope = { fs, path, console }
  vm.runInNewContext(executable, scope)
  const ctx = { argv: { output: "/output" }, virtualPages: [] }
  return {
    pages,
    fs,
    ctx,
    emitter: scope.emitter,
    get: (slug) => pages.get(key(`/output/${slug}.html`)),
  }
}
async function emit(h, content, partial = false, changes = []) {
  const names = []
  const stream = partial
    ? h.emitter().partialEmit(h.ctx, content, {}, changes)
    : h.emitter().emit(h.ctx, content)
  for await (const name of stream) names.push(name.slice("/output/".length).replace(/\.html$/, ""))
  return names
}
function fixed() {
  return baseline ? upstream : patch.patchSource(upstream)
}

for (const sensitive of [false, true]) {
  test(`all 42 collision pairs retain exact source HTML/membership, sensitive=${sensitive}`, async () => {
    assert.equal(collisions.length, 42)
    const h = harness(fixed(), sensitive)
    const content = [],
      expected = new Map()
    for (const c of collisions) {
      for (const [slug, declaredSource] of [
        [c.route, c.source],
        [c.canonical, c.winner],
      ]) {
        // These three manifest winners retain historical casing, unlike Git.
        // Assert exact tracked paths so macOS cannot hide Linux-only fixture errors.
        const historicalWinnerPaths = new Map([
          ["entities/Johns-Hopkins.md", "entities/johns-hopkins.md"],
          ["entities/past-life in Egypt.md", "entities/past-life in egypt.md"],
          ["entities/past-life in Persia.md", "entities/past-life in persia.md"],
        ])
        const source = historicalWinnerPaths.get(declaredSource) ?? declaredSource
        assert.ok(trackedSources.has(`content/${source}`), `untracked source fixture: ${source}`)
        const markdown = readFileSync(new URL(`../content/${source}`, import.meta.url), "utf8")
        const html = `<main data-source=${JSON.stringify(source)}><pre>${markdown.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></main>`
        expected.set(slug, html)
        content.push(item(slug, source))
        await h.fs.writeFile(`/output/${slug}.html`, html)
      }
      assert.notEqual(expected.get(c.route), expected.get(c.canonical))
    }
    assert.equal(expected.size, 84)
    const emitted = await emit(h, content)
    const damaged = [...expected]
      .filter(([slug, html]) => h.get(slug) !== html)
      .map(([slug]) => slug)
    assert.deepEqual(
      damaged,
      [],
      "source HTML including exact membership must survive every alias write",
    )
    const membership = (slug) =>
      [...h.get(slug).matchAll(/\[\[(\d+-\d+)\]\]/g)].map((match) => match[1])
    assert.deepEqual(membership("entities/b-complex-vitamins"), ["379-19", "1013-7", "2157-3"])
    assert.deepEqual(membership("entities/b-complex-vitamins--7171720b9b39"), [
      "4044-1",
      "5150-1",
      "5304-1",
      "5388-1",
    ])
    if (sensitive)
      assert.ok(
        emitted.includes("entities/Johns-Hopkins"),
        "legitimate differently-cased Linux alias survives",
      )
  })

  test(`all alias kinds reserve later source + virtual routes, sensitive=${sensitive}`, async () => {
    const h = harness(fixed(), sensitive)
    const content = [
      item("owner", "Owner.md", ["later", "virtual", "../later", "LaTeR", "valid"]),
      item("later", "later.md"),
    ]
    h.ctx.virtualPages = [item("virtual", undefined)]
    for (const slug of ["owner", "later", "virtual"])
      await h.fs.writeFile(`/output/${slug}.html`, `<main>${slug}</main>`)
    const emitted = await emit(h, content)
    for (const slug of ["owner", "later", "virtual"])
      assert.equal(h.get(slug), `<main>${slug}</main>`)
    assert.ok(emitted.includes("valid"))
    assert.equal(emitted.includes("LaTeR"), sensitive)
    assert.equal(emitted.includes("Owner"), sensitive)
  })

  test(`partial emission reserves unchanged pages and new event sources, sensitive=${sensitive}`, async () => {
    const h = harness(fixed(), sensitive)
    h.ctx.virtualPages = [item("virtual", undefined)]
    const changed = item("changed", "Changed.md", ["later", "added", "virtual", "valid"])[1]
    const added = item("added", "added.md")[1]
    for (const slug of ["later", "added", "virtual"])
      await h.fs.writeFile(`/output/${slug}.html`, `<main>${slug}</main>`)
    await emit(h, [item("later", "later.md")], true, [
      { type: "change", file: changed },
      { type: "add", file: added },
    ])
    for (const slug of ["later", "added", "virtual"])
      assert.equal(h.get(slug), `<main>${slug}</main>`)
    assert.match(h.get("valid"), /http-equiv="refresh"/)
  })
}

test("unpatched actual emitter reproduces exactly 39 canonical conflicts", async () => {
  const h = harness(upstream, true)
  const emitted = await emit(
    h,
    collisions.map((c) => item(c.route, c.source)),
  )
  assert.equal(collisions.filter((c) => emitted.includes(c.canonical)).length, 39)
})

if (!baseline)
  test("package patch is idempotent and rejects drift/tampering before writing", () => {
    const once = patch.patchSource(upstream)
    assert.equal(patch.patchSource(once), once)
    for (const source of [
      upstream + "\n// drift",
      once.replace("if (emittedPaths.has(aliasTargetSlug)) continue;", ""),
      once + once,
    ])
      assert.throws(() => patch.patchSource(source), /unexpected/)
    const root = mkdtempSync(path.join(tmpdir(), "cayce-alias-patch-"))
    const target = path.join(root, "node_modules/@quartz-community/alias-redirects/dist/index.js")
    try {
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, upstream)
      patch.patchAliases(root)
      assert.equal(readFileSync(target, "utf8"), once)
      patch.patchAliases(root)
      assert.equal(readFileSync(target, "utf8"), once)
      writeFileSync(target, upstream + "// drift")
      assert.throws(() => patch.patchAliases(root), /unexpected/)
      assert.equal(readFileSync(target, "utf8"), upstream + "// drift")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
