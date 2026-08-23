#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const configPath = fileURLToPath(new URL("../quartz.config.yaml", import.meta.url))
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=6144" },
    stdio: "inherit",
  })
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

run(process.execPath, ["scripts/patch-quartz-performance.mjs"])
run("npx", ["quartz", "build"])
run(process.execPath, [
  "scripts/strip-content-index.mjs",
  "public/static/contentIndex.json",
  "180",
  "120",
  "4",
  "8",
])
