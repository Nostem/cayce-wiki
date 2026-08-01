import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

const script = new URL("./strip-content-index.mjs", import.meta.url).pathname

test("splits search data from a scoped graph index", () => {
  const dir = mkdtempSync(join(tmpdir(), "cayce-index-test-"))
  const contentPath = join(dir, "contentIndex.json")
  const source = {
    index: { slug: "index", title: "Home", tags: [], links: [], content: "home" },
    "readings/1-1": {
      slug: "readings/1-1",
      title: "1-1",
      tags: ["reading", "series/1-1"],
      links: ["entities/a", "entities/b"],
      content: "A long reading body that must be shortened for client-side search.",
    },
    "readings/1-2": {
      slug: "readings/1-2",
      title: "1-2",
      tags: ["reading", "series/1-1"],
      links: ["entities/a", "entities/b"],
      content: "Another reading body that links the same two entities.",
    },
    "entities/a": {
      slug: "entities/a",
      title: "A",
      tags: ["entity"],
      links: ["readings/1-1"],
      content: "A",
    },
    "entities/b": {
      slug: "entities/b",
      title: "B",
      tags: ["entity"],
      links: ["readings/1-1"],
      content: "B",
    },
    "series/1-1-test": {
      slug: "series/1-1-test",
      title: "Series 1-1",
      tags: ["series"],
      links: ["readings/1-1"],
      content: "Series",
    },
  }
  writeFileSync(contentPath, JSON.stringify(source))

  try {
    const run = spawnSync(process.execPath, [script, contentPath, "24", "2", "1", "2"], {
      encoding: "utf8",
    })
    assert.equal(run.status, 0, run.stderr || run.stdout)

    const search = JSON.parse(readFileSync(contentPath, "utf8"))
    const graph = JSON.parse(readFileSync(join(dir, "graphIndex.json"), "utf8"))

    assert.deepEqual(Object.keys(search["readings/1-1"]).sort(), ["content", "tags", "title"])
    assert.ok(search["readings/1-1"].content.length <= 25)
    assert.deepEqual(graph["readings/1-1"].links.sort(), [
      "entities/a",
      "entities/b",
      "series/1-1-test",
    ])
    assert.ok(
      graph["entities/a"].links.includes("readings/1-2"),
      "graph links include incoming neighbors so the client never scans the full index",
    )
    assert.equal(graph["readings/1-1"].global, undefined)
    assert.equal(graph["entities/a"].global, true)
    assert.ok(graph["entities/a"].globalLinks.includes("entities/b"))
    assert.equal(graph["series/1-1-test"].global, true)
    assert.ok(graph["series/1-1-test"].globalLinks.includes("entities/a"))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
