import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parse } from "yaml"

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

function verificationWorkflow() {
  return parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"))
}

const mainOnly = "${{ github.ref == 'refs/heads/main' }}"

test("verification runs for main PRs and can be reused without production secrets", () => {
  const ci = verificationWorkflow()
  assert.deepEqual(ci.on.pull_request, { branches: ["main"] })
  assert.ok(Object.hasOwn(ci.on, "workflow_call"))
  assert.ok(Object.hasOwn(ci.on, "workflow_dispatch"))
  assert.deepEqual(ci.permissions, { contents: "read" })
  assert.ok(!JSON.stringify(ci).includes("secrets."))
  assert.ok(!JSON.stringify(ci).includes("jackyzha0/quartz"))
})

test("verification executes the full test suite and typecheck after a clean install", () => {
  const ci = verificationWorkflow()
  assert.deepEqual(Object.keys(ci.jobs), ["verify"])
  const job = ci.jobs.verify
  assert.equal(job.if, undefined)
  assert.equal(job.needs, undefined)
  const commands = job.steps.filter((step) => step.run).map((step) => step.run.trim())
  assert.deepEqual(commands, ["npm ci", "npx tsc --noEmit", "npm test"])
  assert.ok(job.steps.some((step) => step.uses?.startsWith("actions/checkout@")))
})

test("production builds and uploads depend on the verified same-commit workflow", () => {
  const deploy = parse(deployWorkflow)
  assert.deepEqual(deploy.on, { push: { branches: ["main"] }, workflow_dispatch: null })
  assert.deepEqual(Object.keys(deploy.jobs).sort(), ["deploy", "verify"])
  assert.equal(deploy.jobs.verify.uses, "./.github/workflows/ci.yml")
  assert.equal(deploy.jobs.verify.secrets, undefined)
  assert.equal(deploy.jobs.deploy.needs, "verify")
  assert.equal(deploy.jobs.deploy.if, mainOnly)
  const commands = deploy.jobs.deploy.steps.filter((step) => step.run).map((step) => step.run)
  const build = commands.indexOf("npm run vercel-build")
  const prepare = commands.indexOf("node scripts/prepare-vercel-output.mjs")
  const publish = commands.findIndex((command) =>
    command.startsWith("vercel deploy --prebuilt --prod"),
  )
  assert.ok(build >= 0 && prepare > build && publish > prepare)
})

test("verification and deployment cannot ignore failures or force success after a failed gate", () => {
  for (const workflow of [verificationWorkflow(), parse(deployWorkflow)]) {
    assert.equal(workflow.defaults, undefined)
    for (const [name, job] of Object.entries(workflow.jobs)) {
      assert.equal(job["continue-on-error"], undefined)
      assert.equal(job.defaults, undefined)
      assert.equal(job.if, name === "deploy" ? mainOnly : undefined)
      for (const step of job.steps ?? []) {
        assert.equal(step["continue-on-error"], undefined)
        assert.equal(step.if, undefined)
        assert.equal(step.shell, undefined)
      }
    }
  }
})
