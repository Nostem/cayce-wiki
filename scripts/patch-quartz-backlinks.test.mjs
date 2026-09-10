import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import vm from "node:vm"

import { tmpdir } from "node:os"

const baseline = process.env.BACKLINKS_BASELINE === "1"
const patch = baseline ? null : await import("./patch-quartz-backlinks.mjs")
const root = mkdtempSync(join(tmpdir(), "cayce-backlinks-test-"))
const paths = ["dist/index.js", "dist/components/index.js"]
const before = `function selectBacklinkSources(allFiles, currentSlug) {
  return allFiles.filter((file) => file.unlisted !== true && file.links?.includes(currentSlug));
}`
const fixtures = paths.map((path) => {
  let source = readFileSync(
    new URL(`../node_modules/@quartz-community/backlinks/${path}`, import.meta.url),
    "utf8",
  )
  if (patch && source.includes(patch.after)) source = source.replace(patch.after, before)
  const target = join(root, "node_modules/@quartz-community/backlinks", path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, source)
  return { path, target, source }
})

function query(source) {
  const start = source.includes("const cayceBacklinkIndexes =")
    ? source.indexOf("const cayceBacklinkIndexes =")
    : source.indexOf("function selectBacklinkSources(")
  const end = source.indexOf("\nvar Backlinks_default", start)
  assert.ok(start >= 0 && end > start, "actual packaged function boundary exists")
  return vm.runInNewContext(source.slice(start, end) + "; selectBacklinkSources")
}
function patched(source) {
  return baseline ? source : patch.patchSource(source)
}
function same(actual, expected) {
  assert.equal(actual.length, expected.length)
  actual.forEach((item, index) => assert.equal(item, expected[index]))
}

for (const fixture of fixtures) {
  test(`${fixture.path}: matches filter, preserves order/identity and does not mutate input`, () => {
    const select = query(patched(fixture.source))
    const shared = Object.freeze({
      slug: "same",
      links: Object.freeze(["a", "a", "self", "absent-target"]),
    })
    const files = Object.freeze([
      shared,
      Object.freeze({
        slug: "private",
        unlisted: true,
        get links() {
          throw Error("unlisted links accessed")
        },
      }),
      Object.freeze({ slug: "self", links: Object.freeze(["self"]) }),
      Object.freeze({ slug: "same", unlisted: "true", links: Object.freeze(["a"]) }),
      Object.freeze({ slug: "empty" }),
      Object.freeze({ slug: "null", links: null }),
      shared,
    ])
    for (const slug of ["a", "self", "absent-target", "missing", "a"]) {
      same(
        select(files, slug),
        files.filter((file) => file.unlisted !== true && file.links?.includes(slug)),
      )
    }
    const result = select(files, "a")
    result.reverse()
    same(
      select(files, "a"),
      files.filter((file) => file.unlisted !== true && file.links?.includes("a")),
    )
    same(select([], "a"), [])
  })

  test(`${fixture.path}: large fixture traverses links once, new arrays invalidate`, () => {
    const select = query(patched(fixture.source))
    let reads = 0,
      edges = 0
    const files = Array.from({ length: 5000 }, (_, index) => {
      const links = Array.from({ length: 8 }, (_, edge) => `target-${(index + edge) % 100}`)
      for (let edge = 0; edge < links.length; edge++) {
        const value = links[edge]
        Object.defineProperty(links, edge, {
          get() {
            edges++
            return value
          },
        })
      }
      return {
        slug: `source-${index}`,
        get links() {
          reads++
          return links
        },
      }
    })
    select(files, "missing")
    assert.equal(reads, 5000)
    assert.equal(edges, 40000)
    for (let i = 0; i < 100; i++) select(files, `target-${i}`)
    assert.equal(reads, 5000, "cached queries must not reread links")
    assert.equal(edges, 40000, "cached queries must not traverse outgoing edges")
    const added = { slug: "added", links: ["new"] }
    const next = [...files, added]
    same(select(next, "new"), [added])
    assert.equal(reads, 10000)
    assert.equal(edges, 80000)
    // In-place updates require a new array reference to refresh the snapshot.
    added.links.push("later")
    same(select(next, "later"), [])
    same(select([...next], "later"), [added])
  })
}

test("both temporary package copies patch idempotently via CLI", { skip: baseline }, () => {
  const script = fileURLToPath(new URL("./patch-quartz-backlinks.mjs", import.meta.url))
  for (let run = 0; run < 2; run++) {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    for (const fixture of fixtures)
      assert.equal(readFileSync(fixture.target, "utf8"), patch.patchSource(fixture.source))
  }
})

test("unknown, duplicated, mixed and tampered fragments fail closed", { skip: baseline }, () => {
  for (const fixture of fixtures) {
    const changed = patch.patchSource(fixture.source)
    assert.equal(patch.patchSource(changed), changed)
    for (const invalid of [
      fixture.source.replace(before, "function selectBacklinkSources() {}"),
      fixture.source + "\n" + before,
      changed + "\n" + before,
      changed + "\n" + patch.after,
      changed.replace("new WeakMap()", "new Map()"),
    ])
      assert.throws(() => patch.patchSource(invalid), /unexpected/)
  }
})

test("invalid second copy prevents any writes to first copy", { skip: baseline }, () => {
  writeFileSync(fixtures[0].target, fixtures[0].source)
  writeFileSync(fixtures[1].target, "upstream changed")
  assert.throws(() => patch.patchBacklinks(root), /unexpected/)
  assert.equal(readFileSync(fixtures[0].target, "utf8"), fixtures[0].source)
  assert.equal(readFileSync(fixtures[1].target, "utf8"), "upstream changed")
})
