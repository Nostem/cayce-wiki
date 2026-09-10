import test from "node:test"
import assert from "node:assert/strict"
import renderToString from "preact-render-to-string"
import NotFound from "./404"
import type { QuartzComponentProps } from "../types"

function page(baseUrl: string, serve = false) {
  return renderToString(
    NotFound()({ cfg: { baseUrl }, ctx: { argv: { serve } } } as unknown as QuartzComponentProps),
  )
}

test("missing-page recovery has a clear title and real library destinations", () => {
  const html = page("cayce-wiki.vercel.app")
  assert.match(html, /<h1>Page not found<\/h1>/)
  assert.match(html, /<main[^>]*>/)
  for (const path of ["/", "/readings", "/entities", "/help"]) {
    assert.ok(html.includes(`href="${path}"`), path)
  }
  assert.doesNotMatch(html, /fetchData|contentIndex|window\.location\.replace/)
})

test("recovery respects deployment subpaths without repeating them in local serving", () => {
  assert.match(page("example.com/archive"), /href="\/archive\/readings"/)
  assert.match(page("example.com/archive/"), /href="\/archive\/help"/)
  assert.match(page("example.com/archive", true), /href="\/readings"/)
})
