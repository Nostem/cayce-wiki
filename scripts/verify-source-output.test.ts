import test from "node:test"
import assert from "node:assert/strict"
import { assertSourcePage } from "./verify-source-output"

test("final page identity accepts source HTML and escaped slug attributes", () => {
  assertSourcePage('<body data-slug="entities/topic"><main>Source</main></body>', "entities/topic")
  assertSourcePage('<body data-slug="entities/a&amp;b"><main>Source</main></body>', "entities/a&b")
})
for (const [name, html] of [
  ["alias overwrite", '<meta http-equiv="refresh" content="0; url=./topic--other">'],
  ["wrong source", '<body data-slug="entities/topic--other"><main>Other source</main></body>'],
  ["empty source", '<body data-slug="entities/topic"></body>'],
  [
    "redirect hidden in source shell",
    '<body data-slug="entities/topic"><main>Source</main><meta http-equiv="refresh" content="0; url=./other"></body>',
  ],
])
  test(`final page identity rejects ${name}`, () => {
    assert.throws(() => assertSourcePage(html, "entities/topic"))
  })
