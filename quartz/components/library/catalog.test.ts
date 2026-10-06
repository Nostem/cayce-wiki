import test from "node:test"
import assert from "node:assert/strict"
import {
  catalogRecord,
  compareCatalog,
  paginate,
  verifyMembership,
  readingCaseId,
  defaultCatalogSort,
  pageSlug,
  detectReadingType,
  isCaseOpening,
  readingTypeSlug,
} from "./catalog"
test("uncertain archival dates are not presented as exact", () => {
  assert.equal(
    catalogRecord(
      { slug: "readings/1-1" },
      "Date: 8/15/1923\nThe exact date of reading is unknown. The date is approximated to have been 8/15/23.",
    ).date,
    undefined,
  )
})

test("natural identifiers preserve duplicate-source suffixes", () => {
  const rows = ["10-1", "2-10", "2-2", "1-1", "257-162_id99", "257-162_id8"].map((id) =>
    catalogRecord({ slug: `readings/${id}`, frontmatter: { reading: id } }),
  )
  assert.deepEqual(
    rows.sort(compareCatalog("id")).map((r) => r.slug),
    ["1-1", "2-2", "2-10", "10-1", "257-162_id8", "257-162_id99"].map((id) => `readings/${id}`),
  )
})
test("original date comes only from source, never modified metadata", () => {
  const row = catalogRecord(
    {
      slug: "readings/1-1",
      frontmatter: { reading: "1-1", summary: "Generated" },
      dates: { modified: new Date() },
    },
    "## Text\n\nDate: 4/8/1938  Sex: M  Age: 19  ReadingID: 7447",
  )
  assert.equal(row.date, "1938-04-08")
  assert.equal(row.summary, "Generated")
  assert.equal(
    catalogRecord({ slug: "readings/2-1", dates: { modified: new Date() } }).date,
    undefined,
  )
})
test("entity display metadata never changes hashed identity", () => {
  const row = catalogRecord({
    slug: "entities/1005--0477d720",
    frontmatter: { entity: "1005", title: "1005--0477d720", reading_count: 8 },
  })
  assert.equal(row.label, "1005")
  assert.equal(row.slug, "entities/1005--0477d720")
})
test("bounded pages reconcile complete unique membership and reject invalid pages", () => {
  const rows = Array.from({ length: 875 }, (_, i) => i)
  const pages = Array.from({ length: 18 }, (_, i) => paginate(rows, i + 1))
  assert.equal(pages[0].rows.length, 50)
  assert.deepEqual(
    pages.flatMap((p) => p.rows),
    rows,
  )
  assert.throws(() => paginate(rows, 0))
  assert.throws(() => paginate(rows, 19))
  assert.throws(() => paginate(rows, 1, 400))
})
test("membership fails closed on capped, dangling, or mismatched reconstruction", () => {
  assert.throws(() => verifyMembership("Atlantis", ["1-1"], 875, new Set(["1-1"])), /membership/)
  assert.throws(() => verifyMembership("Atlantis", ["missing"], 1, new Set(["1-1"])), /missing/)
  assert.deepEqual(
    verifyMembership("Atlantis", ["2-1", "1-1", "1-1"], 2, new Set(["1-1", "2-1"])),
    ["1-1", "2-1"],
  )
})

test("entity catalogs sort by reading count descending", () => {
  const rows = [
    catalogRecord({ slug: "entities/a", frontmatter: { entity: "[23]", reading_count: 4 } }),
    catalogRecord({ slug: "entities/b", frontmatter: { entity: "Atlantis", reading_count: 875 } }),
    catalogRecord({ slug: "entities/c", frontmatter: { entity: "Dreams", reading_count: 100 } }),
  ]
  assert.deepEqual(
    rows.sort(compareCatalog("count")).map((r) => r.label),
    ["Atlantis", "Dreams", "[23]"],
  )
})
test("readingCaseId and entity default sort helpers", () => {
  assert.equal(readingCaseId("294-12"), "294")
  assert.equal(readingCaseId("1527-2"), "1527")
  assert.equal(readingCaseId("364"), undefined)
  assert.equal(defaultCatalogSort("entities"), "count")
  assert.equal(defaultCatalogSort("readings"), "id")
  assert.equal(pageSlug("entities", 1, "count", "count"), "entities")
  assert.equal(pageSlug("entities", 1, "id", "count"), "entities/by-name")
  assert.equal(pageSlug("readings", 2, "id", "id"), "readings/page/2")
})

test("detectReadingType from archival suggestion lines", () => {
  assert.equal(detectReadingType("Time of Reading\n(Physical Suggestion)\n\n1. EC:"), "Physical")
  assert.equal(detectReadingType("(Life Reading)"), "Life")
  assert.equal(detectReadingType("(Business Reading)"), "Business")
  assert.equal(detectReadingType("(Dream Reading)"), "Dream")
  assert.equal(detectReadingType("no type here"), undefined)
  assert.equal(
    catalogRecord(
      { slug: "readings/1527-2", frontmatter: { reading: "1527-2" } },
      "(Physical Suggestion)\n1. EC: Yes.",
    ).readingType,
    "Physical",
  )
})

test("the export's usual '(Life Reading Suggestion)' line is detected as Life", () => {
  assert.equal(
    detectReadingType("Time of Reading 11:25 to 12:05 Noon.\n(Life Reading Suggestion)\nEC: Yes"),
    "Life",
  )
  assert.equal(detectReadingType("(Business Reading Suggestion)"), "Business")
  assert.equal(detectReadingType("(Physical Reading Suggestion)"), "Physical")
  // Report correspondence never decides the type.
  assert.equal(detectReadingType("1. EC: Yes.\n## Reports\n(Life Reading Suggestion)"), undefined)
})

test("case openings and type slug helpers", () => {
  assert.equal(isCaseOpening("1527-1"), true)
  assert.equal(isCaseOpening("1527-2"), false)
  assert.equal(isCaseOpening("257-162_id8"), false)
  assert.equal(readingTypeSlug("Mental-Spiritual"), "mental-spiritual")
})

test("literal associations sort ahead of semantic on topic lists", () => {
  const rows = [
    { slug: "readings/2-1", label: "2-1", kind: "readings", association: "semantic" as const },
    { slug: "readings/1-1", label: "1-1", kind: "readings", association: "literal" as const },
    { slug: "readings/3-1", label: "3-1", kind: "readings", association: "literal" as const },
  ]
  assert.deepEqual(
    rows.sort(compareCatalog("id")).map((r) => r.label),
    ["1-1", "3-1", "2-1"],
  )
})

test("name-only mislink rows sort after literal and semantic rows", () => {
  const rows = [
    { slug: "readings/1-1", label: "1-1", kind: "readings", association: "name-only" as const },
    { slug: "readings/2-1", label: "2-1", kind: "readings", association: "semantic" as const },
    { slug: "readings/3-1", label: "3-1", kind: "readings", association: "literal" as const },
  ]
  assert.deepEqual(
    rows.sort(compareCatalog("id")).map((r) => r.label),
    ["3-1", "2-1", "1-1"],
  )
})
