import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import YAML from "yaml"
import { h } from "preact"
import renderToString from "preact-render-to-string"
import { BrowseSidebar, browseLinks, conceptLinks } from "./index"

const componentSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
const builtComponentSource = readFileSync(
  new URL("../../dist/components/index.js", import.meta.url),
  "utf8",
)
const quartzConfig = YAML.parse(
  readFileSync(new URL("../../../../quartz.config.yaml", import.meta.url), "utf8"),
)

test("defines fixed navigation without reading the full page inventory", () => {
  assert.equal(browseLinks.length, 4)
  assert.equal(conceptLinks.length, 10)
  assert.ok(conceptLinks.every(({ href }) => href.startsWith("/entities/")))
  assert.doesNotMatch(componentSource, /allFiles|contentIndex|fetchData/)
})

test("exposes accessible browse and concept navigation", () => {
  assert.match(componentSource, /Browse the Cayce wiki/)
  assert.match(componentSource, /Key concepts/)
  assert.deepEqual(
    browseLinks.map(({ href }) => href),
    ["/", "/readings", "/entities", "/series"],
  )
})

test("ships the built component and registers it at every breakpoint", () => {
  assert.match(builtComponentSource, /Browse the Cayce wiki/)
  assert.doesNotMatch(builtComponentSource, /allFiles|contentIndex|fetchData/)

  const browsePlugin = quartzConfig.plugins.find(
    ({ source }: { source: string }) => source === "./plugins/browse-sidebar",
  )
  assert.deepEqual(browsePlugin, {
    source: "./plugins/browse-sidebar",
    enabled: true,
    layout: {
      position: "left",
      priority: 50,
      display: "all",
    },
  })

  const explorer = quartzConfig.plugins.find(
    ({ source }: { source: string }) => source === "@quartz-community/explorer",
  )
  assert.equal(explorer?.enabled, false, "the full 24,000-page Explorer must remain disabled")
})

test("provides a native mobile disclosure and identifies the current section", () => {
  const Component = BrowseSidebar()
  const html = renderToString(h(Component as any, { fileData: { slug: "readings/1527-2" } }))
  assert.match(html, /<summary>Browse library<\/summary>/)
  assert.match(html, /href="\/readings"[^>]*aria-current="page"/)
  assert.doesNotMatch(html, /href="\/"[^>]*aria-current/)
  assert.match(html, /href="\/help"/)
})

test("home is current only for the home page, not other index pages", () => {
  const Component = BrowseSidebar()
  const home = renderToString(h(Component as any, { fileData: { slug: "index" } }))
  const entity = renderToString(h(Component as any, { fileData: { slug: "entities/index" } }))
  assert.match(home, /href="\/"[^>]*aria-current="page"/)
  assert.doesNotMatch(entity, /href="\/"[^>]*aria-current/)
  assert.match(entity, /href="\/entities"[^>]*aria-current="page"/)
})
