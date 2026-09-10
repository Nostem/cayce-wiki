#!/usr/bin/env node
/** Reserve source/virtual output ownership before any packaged alias writes.
 * Run after dependency installation, before Quartz loads plugins. This patch is
 * deliberately pinned to the complete installed bundle: upstream drift or a
 * partial/tampered patch fails closed rather than silently dropping protection.
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const upstreamHash = "c08124ab4959d98e7bcdfabceea4ee64ca35f0f42df29a7550b2d9a6cc638cc8"
const hash = (source) => createHash("sha256").update(source).digest("hex")
const helper = `async function cayceReservedAliasPaths(ctx, content, changeEvents = []) {
  const caseSensitive = await isFsCaseSensitive(ctx.argv.output);
  // Key actual output paths, not lowercased URL slugs. Linux must retain valid
  // case-only aliases; insensitive filesystems must protect case equivalents.
  const key = (slug) => {
    const outputPath = path.normalize(joinSegments(ctx.argv.output, slug + ".html"));
    return caseSensitive ? outputPath : outputPath.toLowerCase();
  };
  const paths = new Set();
  const reserve = (file) => {
    if (typeof file?.data?.slug !== "string") throw new Error("AliasRedirects: source route missing");
    paths.add(key(file.data.slug));
  };
  // Complete this pass BEFORE any aliases, including aliases of earlier files.
  for (const [, file] of content) reserve(file);
  for (const [, file] of ctx.virtualPages ?? []) reserve(file);
  for (const event of changeEvents) {
    if (event.file && (event.type === "add" || event.type === "change")) reserve(event.file);
  }
  return {
    has: (slug) => paths.has(key(slug)),
    add: (slug) => paths.add(key(slug))
  };
}
`
const replacements = [
  [
    "async function* processAliases(ctx, file, emittedPaths) {",
    helper + "async function* processAliases(ctx, file, emittedPaths) {",
  ],
  [
    "    emittedPaths.add(aliasTargetSlug);",
    "    if (emittedPaths.has(aliasTargetSlug)) continue;\n    emittedPaths.add(aliasTargetSlug);",
  ],
  [
    "async *emit(ctx, content) {\n      const emittedPaths = /* @__PURE__ */ new Set();",
    "async *emit(ctx, content) {\n      const emittedPaths = await cayceReservedAliasPaths(ctx, content);",
  ],
  [
    "async *partialEmit(ctx, _content, _resources, changeEvents) {\n      const emittedPaths = /* @__PURE__ */ new Set();",
    "async *partialEmit(ctx, _content, _resources, changeEvents) {\n      const emittedPaths = await cayceReservedAliasPaths(ctx, _content, changeEvents);",
  ],
]

function replaceExactly(source, before, after, label) {
  if (source.split(before).length !== 2)
    throw new Error(`${label}: unexpected alias bundle anchor count`)
  return source.replace(before, () => after)
}

export function unpatchSource(source, label = "alias-redirects") {
  if (hash(source) === upstreamHash) return source
  let restored = source
  for (const [before, after] of [...replacements].reverse())
    restored = replaceExactly(restored, after, before, label)
  if (hash(restored) !== upstreamHash) throw new Error(`${label}: unexpected alias bundle source`)
  return restored
}

export function patchSource(source, label = "alias-redirects") {
  let patched = unpatchSource(source, label)
  for (const [before, after] of replacements)
    patched = replaceExactly(patched, before, after, label)
  return patched
}

export function patchAliases(root = process.cwd()) {
  const target = join(root, "node_modules/@quartz-community/alias-redirects/dist/index.js")
  const source = readFileSync(target, "utf8")
  const patched = patchSource(source, target)
  if (source !== patched) writeFileSync(target, patched)
  return [target]
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  patchAliases()
  console.log("Quartz alias source/virtual route reservations applied")
}
