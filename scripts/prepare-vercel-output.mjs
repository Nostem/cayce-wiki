#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const source = process.argv[2] ?? "public"
const outputRoot = process.argv[3] ?? ".vercel/output"
const staticTarget = join(outputRoot, "static")

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })
cpSync(source, staticTarget, { recursive: true })
writeFileSync(join(outputRoot, "config.json"), `${JSON.stringify({ version: 3 }, null, 2)}\n`)

const config = JSON.parse(readFileSync(join(outputRoot, "config.json"), "utf8"))
if (config.version !== 3) throw new Error("invalid Vercel Build Output API configuration")
console.log(`Prepared ${staticTarget} for a prebuilt Vercel deployment`)
