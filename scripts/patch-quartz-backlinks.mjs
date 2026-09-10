#!/usr/bin/env node
/**
 * Run AFTER the performance and accessibility patches. Patch only the exact
 * filter helper in both packaged entry points; validate both before any write.
 *
 * Cache contract: allFiles is a build snapshot. Reuse its array identity during
 * rendering; provide a NEW array after changing membership, links or unlisted.
 * In-place mutation cannot invalidate a WeakMap without rescanning the corpus,
 * which would restore the original quadratic render cost. New arrays used by
 * partial builds get fresh indexes; old snapshots can be garbage-collected.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

export const before = `function selectBacklinkSources(allFiles, currentSlug) {
  return allFiles.filter((file) => file.unlisted !== true && file.links?.includes(currentSlug));
}`

export const after = `const cayceBacklinkIndexes = new WeakMap();
function selectBacklinkSources(allFiles, currentSlug) {
  let reverse = cayceBacklinkIndexes.get(allFiles);
  if (!reverse) {
    reverse = new Map();
    allFiles.forEach((file) => {
      if (file.unlisted === true) return;
      const links = file.links;
      if (links == null) return;
      const seen = new Set();
      for (const target of links) {
        if (seen.has(target)) continue;
        seen.add(target);
        let sources = reverse.get(target);
        if (!sources) reverse.set(target, sources = []);
        sources.push(file);
      }
    });
    cayceBacklinkIndexes.set(allFiles, reverse);
  }
  // Match filter's fresh result array: callers cannot mutate the cached index.
  return (reverse.get(currentSlug) ?? []).slice();
}`

export function patchSource(source, label = "backlinks") {
  const count = (text) => source.split(text).length - 1
  const oldCount = count(before)
  const newCount = count(after)
  const declarations = count("function selectBacklinkSources(")
  const caches = count("const cayceBacklinkIndexes =")
  if (oldCount === 0 && newCount === 1 && declarations === 1 && caches === 1) return source
  if (oldCount !== 1 || newCount !== 0 || declarations !== 1 || caches !== 0) {
    throw new Error(
      `${label}: unexpected backlink source/count (${oldCount},${newCount},${declarations},${caches})`,
    )
  }
  return source.replace(before, () => after)
}

export function patchBacklinks(root = process.cwd()) {
  const updates = ["dist/index.js", "dist/components/index.js"].map((relative) => {
    const path = join(root, "node_modules/@quartz-community/backlinks", relative)
    const source = readFileSync(path, "utf8")
    return { path, source, patched: patchSource(source, path) }
  })
  for (const { path, source, patched } of updates) {
    if (source !== patched) writeFileSync(path, patched)
  }
  return updates.map(({ path }) => path)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  patchBacklinks()
  console.log("Quartz linear backlink indexes applied (both packaged copies)")
}
