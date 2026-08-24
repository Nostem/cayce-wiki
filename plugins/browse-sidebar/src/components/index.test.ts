import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import YAML from "yaml"
import { browseLinks, conceptLinks } from "./index"

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

test("ships the built component and registers it as desktop-only navigation", () => {
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
      display: "desktop-only",
    },
  })

  const explorer = quartzConfig.plugins.find(
    ({ source }: { source: string }) => source === "@quartz-community/explorer",
  )
  assert.equal(explorer?.enabled, false, "the full 24,000-page Explorer must remain disabled")
})
