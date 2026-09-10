import test from "node:test"
import assert from "node:assert/strict"
import { catalogRecord, compareCatalog, paginate, verifyMembership } from "./catalog"
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
  const pages = Array.from({ length: 22 }, (_, i) => paginate(rows, i + 1))
  assert.equal(pages[0].rows.length, 40)
  assert.deepEqual(
    pages.flatMap((p) => p.rows),
    rows,
  )
  assert.throws(() => paginate(rows, 0))
  assert.throws(() => paginate(rows, 23))
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
