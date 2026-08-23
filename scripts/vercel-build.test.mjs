import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const buildScript = readFileSync(new URL("./vercel-build.mjs", import.meta.url), "utf8")
const outputScript = readFileSync(new URL("./prepare-vercel-output.mjs", import.meta.url), "utf8")
const deployWorkflow = readFileSync(
  new URL("../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
)
const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

test("Vercel build preserves the large-vault optimization pipeline", () => {
  const patch = buildScript.indexOf("patch-quartz-performance.mjs")
  const build = buildScript.indexOf('["quartz", "build"]')
  const strip = buildScript.indexOf("strip-content-index.mjs")

  assert.ok(patch >= 0, "performance patches run before the Quartz build")
  assert.ok(build > patch, "Quartz builds after performance patching")
  assert.ok(strip > build, "search and graph indexes shrink after the Quartz build")
})

test("Vercel build uses the production deployment host as Quartz baseUrl", () => {
  assert.match(buildScript, /VERCEL_PROJECT_PRODUCTION_URL \|\| process\.env\.VERCEL_URL/)
  assert.match(buildScript, /baseUrlPattern/)
})

test("Vercel serves the generated public directory with clean URLs", () => {
  assert.equal(packageJson.scripts["vercel-build"], "node scripts/vercel-build.mjs")
  assert.equal(vercelConfig.buildCommand, "npm ci && npm run vercel-build")
  assert.equal(vercelConfig.outputDirectory, "public")
  assert.equal(vercelConfig.cleanUrls, true)
})

test("GitHub Actions builds canonical URLs for the Vercel production host", () => {
  assert.match(deployWorkflow, /run: npm run vercel-build/)
  assert.match(deployWorkflow, /VERCEL_PROJECT_PRODUCTION_URL: cayce-wiki\.vercel\.app/)
})

test("GitHub Actions deploys the completed Quartz build as a prebuilt artifact", () => {
  assert.match(outputScript, /\.vercel\/output/)
  assert.match(outputScript, /version: 3/)
  assert.match(deployWorkflow, /prepare-vercel-output\.mjs/)
  assert.match(deployWorkflow, /vercel deploy --prebuilt --prod/)
  assert.match(deployWorkflow, /--archive=tgz/)
  assert.match(deployWorkflow, /secrets\.VERCEL_TOKEN/)
  assert.match(deployWorkflow, /VERCEL_PROJECT_ID: prj_qoOG7HRXdkOWcjRhMBdfMPFnVdSl/)
})
