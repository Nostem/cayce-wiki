import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { assertCatalogPage, verifyCatalogOutput } from "./verify-topic-groups"

const expected = {
  slug: "topics/test",
  targets: ["readings/257-162", "readings/257-162_id123"],
  total: 2,
  start: 1,
  end: 2,
}
function html(targets = expected.targets) {
  return `<html><body data-slug='topics/test'><main><section class='extra library-catalog'><p class='catalog-count'>1–2 of 2 records</p><a href='/readings/not-a-row'>incidental</a><ol class='catalog-rows'>${targets.map((target) => `<li class='catalog-row extra'><h3><a href='../${target}'>Reading</a></h3></li>`).join("")}</ol></section></main></body></html>`
}
test("actual HTML rows preserve distinct _id identities and ignore incidental links", () => {
  assertCatalogPage(html(), expected)
})
test("wrong body identity fails precisely", () => {
  assert.throws(
    () =>
      assertCatalogPage(
        html().replace("data-slug='topics/test'", "data-slug='topics/wrong'"),
        expected,
      ),
    /topics\/test: wrong rendered source identity/,
  )
})
test("wrong reading IDs and order fail precisely", () => {
  assert.throws(
    () => assertCatalogPage(html(["readings/999-1", expected.targets[1]]), expected),
    /topics\/test: row targets\/order mismatch/,
  )
  assert.throws(
    () => assertCatalogPage(html([...expected.targets].reverse()), expected),
    /row targets\/order mismatch/,
  )
})
test("duplicates and lossy _id dedup cannot pass", () => {
  assert.throws(
    () => assertCatalogPage(html([expected.targets[0], expected.targets[0]]), expected),
    /duplicate row target/,
  )
  assert.throws(
    () => assertCatalogPage(html([expected.targets[0]]), expected),
    /row count mismatch/,
  )
})
test("emitted file verification rejects missing and extra pages and cleans fixtures", () => {
  const output = mkdtempSync(path.join(tmpdir(), "topic-gate-"))
  try {
    mkdirSync(path.join(output, "topics"))
    const pages = new Map([[expected.slug, expected]])
    assert.throws(
      () => verifyCatalogOutput(output, pages),
      /topics\/test: missing\/unreadable emitted page/,
    )
    writeFileSync(path.join(output, "topics/test.html"), html())
    verifyCatalogOutput(output, pages)
    writeFileSync(path.join(output, "topics/stale.html"), html())
    assert.throws(() => verifyCatalogOutput(output, pages), /emitted topic inventory mismatch/)
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})

test("count and redirect corruption fail", () => {
  assert.throws(
    () => assertCatalogPage(html().replace("of 2 records", "of 22 records"), expected),
    /record count mismatch/,
  )
  assert.throws(
    () =>
      assertCatalogPage(
        html().replace(
          "<html>",
          '<html><head><meta http-equiv="refresh" content="0;url=/elsewhere"></head>',
        ),
        expected,
      ),
    /replaced by redirect/,
  )
})
