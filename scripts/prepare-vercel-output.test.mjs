import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./prepare-vercel-output.mjs", import.meta.url))
const immutable = "public,max-age=31536000,immutable"
const hash = (content) => createHash("sha256").update(content).digest("hex").slice(0, 8)

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "cayce-vercel-output-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, "public")
  const output = join(root, ".vercel/output")
  mkdirSync(source)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(source, name)), { recursive: true })
    writeFileSync(join(source, name), content)
  }
  mkdirSync(join(output, "static"), { recursive: true })
  writeFileSync(join(output, "static/stale.js"), "stale")
  const run = spawnSync(process.execPath, [script, source, output], { encoding: "utf8" })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const config = JSON.parse(readFileSync(join(output, "config.json"), "utf8"))
  return { config, source, output }
}

function cacheRoutes(config) {
  return (config.routes ?? []).filter((route) => route.headers?.["Cache-Control"])
}

function cacheFor(config, path) {
  return cacheRoutes(config).filter((route) => new RegExp(route.src).test(path))
}

test("emits immutable headers only for verified Quartz content hashes and preserves files", (t) => {
  const css = "body{color:red}"
  const js = "console.log('fixture')"
  const files = {
    [`index-${hash(css)}.css`]: css,
    [`component-${hash(css)}.css`]: css,
    [`prescript-${hash(js)}.js`]: js,
    [`postscript-${hash(js)}.js`]: js,
    [`static/scripts/script-2-${hash(js)}.js`]: js,
    [`static/resource-style-${hash(css)}.css`]: css,
    [`static/resource-before-${hash(js)}.js`]: js,
    [`static/resource-after-${hash(js)}.js`]: js,
  }
  const stable = {
    "index.html": "<h1>Home</h1>",
    "readings/1-1.html": "<h1>Reading</h1>",
    "static/contentIndex.json": "{}",
    "static/graphIndex.json": "{}",
    "index.css": css,
    "prescript.js": js,
    "static/scripts/script-2.js": js,
    "static/resource-style.css": css,
    "static/resource-after.js": js,
    "static/fonts/opaqueGoogleFont-v17.woff2": "font",
    [`static/fonts/font-${hash("font")}.woff2`]: "font",
    [`unrelated-${hash(js)}.js`]: js,
    [`readings/index-${hash(css)}.css`]: css,
    [`index-${hash(css)}.html`]: "HTML",
    [`index-${hash(css)}.css.map`]: "{}",
    [`index-${hash(css)}.css.backup`]: css,
    [`index-${hash(css)}.js`]: js,
    [`static/scripts/script-x-${hash(js)}.js`]: js,
    // Plausible names must not qualify when the bytes do not match the hash.
    "index-bb6c1746.css": css,
    "static/scripts/script-2-637f65d7.js": js,
    "component-deadbeef.css": css,
    "static/resource-style-deadbeef.css": css,
    "static/resource-after-deadbeef.js": js,
  }
  const { config, output, source } = fixture(t, { ...files, ...stable })
  assert.equal(config.version, 3)
  assert.ok(cacheRoutes(config).length > 0)
  for (const name of Object.keys(files)) {
    const matches = cacheFor(config, `/${name}`)
    assert.equal(matches.length, 1, name)
    assert.equal(matches[0].headers["Cache-Control"], immutable)
    assert.equal(matches[0].continue, true)
    assert.equal(matches[0].caseSensitive, true)
    for (const wrong of [
      `/${name}/extra`,
      `/prefix/${name}`,
      `/${name}.html`,
      `/${name.toUpperCase()}`,
    ]) {
      assert.equal(cacheFor(config, wrong).length, 0, wrong)
    }
  }
  for (const name of Object.keys(stable)) assert.equal(cacheFor(config, `/${name}`).length, 0, name)
  assert.equal(cacheFor(config, "/index-00000000.css").length, 0, "absent file")
  assert.equal(cacheFor(config, "/readings/1-1").length, 0, "clean HTML URL")
  assert.deepEqual(config.routes.at(-1), { handle: "filesystem" })
  assert.ok(
    config.routes.every((route) => !route.dest && !route.status),
    "no rewrites or redirects change clean URLs",
  )
  for (const [name, content] of Object.entries({ ...files, ...stable })) {
    assert.equal(readFileSync(join(output, "static", name), "utf8"), content)
    assert.equal(readFileSync(join(source, name), "utf8"), content)
  }
  assert.equal(existsSync(join(output, "static/stale.js")), false)
})

test("empty/unhashed builds have no immutable rules", (t) => {
  const { config } = fixture(t, { "index.html": "home", "index.css": "body{}" })
  assert.deepEqual(cacheRoutes(config), [])
  assert.deepEqual(config.routes, [{ handle: "filesystem" }])
})

test("exact asset routes stay bounded as script count grows", (t) => {
  const files = Object.fromEntries(
    Array.from({ length: 150 }, (_, i) => {
      const content = `console.log(${i})`
      return [`static/scripts/script-${i}-${hash(content)}.js`, content]
    }),
  )
  const { config } = fixture(t, files)
  const routes = cacheRoutes(config)
  assert.ok(routes.length > 0 && routes.length < 20)
  assert.ok(routes.every((route) => route.src.length <= 2048))
  for (const name of Object.keys(files)) assert.equal(cacheFor(config, `/${name}`).length, 1, name)
})
