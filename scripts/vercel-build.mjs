#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const configPath = fileURLToPath(new URL("../quartz.config.yaml", import.meta.url))
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
const nodeOptions = process.env.NODE_OPTIONS || "--max-old-space-size=12288"

function run(command, args, label = `${command} ${args.join(" ")}`) {
  const started = Date.now()
  console.log(`[vercel-build] start ${label} @ ${new Date().toISOString()}`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    stdio: "inherit",
  })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[vercel-build] done ${label} in ${elapsed}s (status=${result.status ?? "null"})`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (deploymentHost) {
  const config = readFileSync(configPath, "utf8")
  const baseUrlPattern = /^(\s*baseUrl:\s*).+$/m
  if (!baseUrlPattern.test(config))
    throw new Error("quartz.config.yaml is missing configuration.baseUrl")
  writeFileSync(configPath, config.replace(baseUrlPattern, `$1${deploymentHost}`))
  console.log(`Building Quartz for https://${deploymentHost}`)
}

run("npm", ["run", "build:local-plugins"], "build:local-plugins")
run(process.execPath, ["scripts/patch-quartz-performance.mjs"], "patch-quartz-performance")
run(process.execPath, ["scripts/patch-quartz-accessibility.mjs"], "patch-quartz-accessibility")
run(process.execPath, ["scripts/patch-quartz-backlinks.mjs"], "patch-quartz-backlinks")
run(process.execPath, ["scripts/patch-quartz-aliases.mjs"], "patch-quartz-aliases")
// Cap workers so concurrent page emits do not fight a large shared heap.
run("npx", ["quartz", "build", "--concurrency=2"], "quartz build")
run("npx", ["tsx", "scripts/verify-source-output.ts", "public"], "verify-source-output")
run("npx", ["tsx", "scripts/verify-topic-groups.ts", "public"], "verify-topic-groups")
run(
  process.execPath,
  ["scripts/strip-content-index.mjs", "public/static/contentIndex.json", "180", "120", "4", "8"],
  "strip-content-index",
)
run(process.execPath, ["scripts/prioritize-sitemap.mjs", "public/sitemap.xml"], "prioritize-sitemap")
