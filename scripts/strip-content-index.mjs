#!/usr/bin/env node
/* Post-build: shrink static/contentIndex.json so the SPA loads fast.
 *
 * Quartz ships every page's full text to the browser in contentIndex.json
 * for search + graph + popovers. With 24k readings that's ~158 MB and makes
 * the SPA unusably slow. The graph needs title/tags/links; search needs
 * title/tags + a content snippet for result cards. So we keep a short
 * excerpt (search still returns useful previews) and drop the rest.
 *
 * Usage: node scripts/strip-content-index.mjs [path-to-contentIndex.json] [excerptChars]
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const target = process.argv[2] ?? join("public", "static", "contentIndex.json");
const EXCERPT = Number(process.argv[3] ?? 300);

const before = statSync(target).size;
const index = JSON.parse(readFileSync(target, "utf8"));

let trimmed = 0;
for (const slug of Object.keys(index)) {
  const item = index[slug];
  if (!item || typeof item !== "object") continue;
  if (typeof item.content === "string" && item.content.length > EXCERPT) {
    // Collapse whitespace then truncate at a word boundary
    let c = item.content.replace(/\s+/g, " ").trim().slice(0, EXCERPT);
    const lastSpace = c.lastIndexOf(" ");
    if (lastSpace > EXCERPT * 0.6) c = c.slice(0, lastSpace);
    item.content = c + "…";
    trimmed++;
  }
  delete item.filePath;
  delete item.richContent;
}

writeFileSync(target, JSON.stringify(index));
const after = statSync(target).size;
console.log(
  `contentIndex.json: trimmed ${trimmed} excerpts ` +
  `(${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB)`
);
