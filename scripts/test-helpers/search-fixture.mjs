import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { transforms as accessibilityTransforms } from "../patch-quartz-accessibility.mjs"

// Transform fixtures in memory; npm test must also work before build-time patches.
const patchSource = readFileSync(
  new URL("../patch-quartz-performance.mjs", import.meta.url),
  "utf8",
)

export function searchFixture(path = "dist/index.js") {
  const declarations = patchSource
    .slice(0, patchSource.indexOf('\npatchFile("node_modules/'))
    .replace(/^#!.*$/gm, "")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "")
  const { searchTransforms, replaceOnce } = new Function(
    `${declarations};return {searchTransforms,replaceOnce}`,
  )()
  let source = readFileSync(
    new URL(`../../node_modules/@quartz-community/search/${path}`, import.meta.url),
    "utf8",
  )
  for (const [before, after, label] of [...accessibilityTransforms.search].reverse()) {
    if (source.includes(after)) source = replaceOnce(source, after, before, label)
  }
  for (const [before, after, label] of [...searchTransforms].reverse()) {
    if (source.includes(after)) source = replaceOnce(source, after, before, label)
  }
  for (const [before, after, label] of searchTransforms) {
    source = replaceOnce(source, before, after, label)
    assert.throws(() => replaceOnce(before + before, before, after, label), /not unique/)
    assert.throws(() => replaceOnce("", before, after, label), /not found/)
  }
  return source
}
