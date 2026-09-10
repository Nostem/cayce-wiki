import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

// Source Markdown rendered to a simple raw-content model, not a full Quartz index.
const raw = readFileSync(new URL("../content/readings/1-1.md", import.meta.url), "utf8")
  .replace(/^---[\s\S]*?---\s*/, "")
  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? target)
  .replace(/^[#>]+\s*/gm, "")
  .replace(/\*\*/g, "")
  .replace(/\s+/g, " ")
  .trim()

function runIndex(source) {
  const dir = mkdtempSync(join(tmpdir(), "cayce-excerpts-"))
  try {
    const path = join(dir, "contentIndex.json")
    writeFileSync(path, JSON.stringify(source))
    const run = spawnSync(
      process.execPath,
      [new URL("./strip-content-index.mjs", import.meta.url).pathname, path],
      { encoding: "utf8" },
    )
    assert.equal(run.status, 0, run.stderr)
    return {
      search: JSON.parse(readFileSync(path)),
      graph: JSON.parse(readFileSync(join(dir, "graphIndex.json"))),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("CLI adds source date and numbered transcript without changing membership or graph", () => {
  const source = {
    "readings/1-1": { title: "1-1", tags: ["reading"], links: ["topics/health"], content: raw },
    "readings/2-1": {
      title: "2-1",
      tags: ["reading"],
      links: [],
      content:
        "TEXT OF READING 2-1 Text Date: 6/20/1934 Sex: F Age: 40 ReadingID: 2 This psychic reading was given. Time of Reading 1. EC: We have the body and its conditions before us. 2. Next paragraph. Reports Date: 9/1/1960 Sex: F ReadingID: 2",
    },
    "topics/health": {
      title: "Health",
      tags: ["topic"],
      links: [],
      content: "Health\n\nHealth concerns physical and mental wellbeing.\n\nReadings\n1-1 2-1 3-1",
    },
  }
  const { search, graph } = runIndex(source)
  const unchanged = runIndex(
    Object.fromEntries(Object.entries(source).map(([k, v]) => [k, { ...v, content: "unrelated" }])),
  ).graph
  assert.deepEqual(graph, unchanged)
  assert.deepEqual(Object.keys(search), Object.keys(source))
  for (const [key, entry] of Object.entries(search)) {
    assert.deepEqual(Object.keys(entry).sort(), ["content", "tags", "title"])
    assert.equal(entry.title, source[key].title)
    assert.deepEqual(entry.tags, source[key].tags)
    assert.ok(entry.content.length <= 180)
  }
  assert.match(search["readings/1-1"].content, /8\/15\/1923 \(approximate\)/)
  assert.match(search["readings/1-1"].content, /Transcript: EC: Yes, we have the body here/)
  assert.match(search["readings/2-1"].content, /^6\/20\/1934 · Transcript: EC: We have/)
  assert.doesNotMatch(search["readings/2-1"].content, /1960|Next paragraph/)
  assert.match(search["topics/health"].content, /Health concerns physical/)
  assert.doesNotMatch(search["topics/health"].content, /1-1 2-1/)
})

test("entity lead excludes the production Readings mentioning list", () => {
  const { search } = runIndex({
    "entities/example": {
      title: "example",
      content:
        "example example (condition) appears in 5 readings — indexed through LLM semantic extraction. Readings mentioning example 585-11, 739-1, 1170-3 Auto-generated index.",
    },
  })
  assert.match(search["entities/example"].content, /example \(condition\) appears in 5 readings/)
  assert.doesNotMatch(search["entities/example"].content, /585-11|Readings mentioning/)
})

test("actual Quartz list text keeps transcript after ordinal markers are stripped", () => {
  // Shortened regression fixture based on Quartz's actual full-index text shape.
  const content =
    "TEXT OF READING 1527-2 M 19\nReading 1527-2 · Series: 1501-2000 · Year: 1938 · Sex: M\nText\nDate: 4/8/1938  Sex: M  Age: 19  ReadingID: 7447\nThis Psychic Reading given by Edgar Cayce.\nTime of Reading\n3:35 to 3:50 P. M.\n(Physical Suggestion)\n\n\nEC:  Yes.\n\n\nAs we find, conditions are greatly improved.\n\n\nWhile the lesions in the right side have in the greater part been broken up.\nReports\nLater correspondence."
  const { search } = runIndex({ "readings/1527-2": { title: "1527-2", content } })
  assert.match(
    search["readings/1527-2"].content,
    /^4\/8\/1938 · Transcript: EC: Yes\. As we find, conditions are greatly improved\./,
  )
  assert.doesNotMatch(search["readings/1527-2"].content, /Later correspondence/)
  assert.ok(search["readings/1527-2"].content.length <= 180)
})

test("report dates and report numbering are never reading context", () => {
  const { search } = runIndex({
    "readings/3-1": {
      title: "3-1",
      content:
        "Text No original date recorded. Reports Date: 1/1/1960 Sex: M ReadingID: 3 1. Letter from a reader.",
    },
  })
  assert.doesNotMatch(search["readings/3-1"].content, /1960|Letter from a reader/)
})
