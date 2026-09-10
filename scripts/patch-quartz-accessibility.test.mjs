import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import {
  patch,
  patchSource,
  transforms,
  replaceChecked,
  accessibilityGraphOpen,
} from "./patch-quartz-accessibility.mjs"

const root = new URL("../", import.meta.url)
const performance = readFileSync(new URL("./patch-quartz-performance.mjs", import.meta.url), "utf8")
const declarations = performance
  .slice(0, performance.indexOf('\npatchFile("node_modules/'))
  .replace(/^#!.*$/gm, "")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "")
const perf = new Function(
  declarations + ";return {search:searchTransforms,graph:graphTransforms}",
)()
function installed(name, file = "dist/index.js") {
  return readFileSync(new URL("node_modules/@quartz-community/" + name + "/" + file, root), "utf8")
}
function unpatch(source, list) {
  for (const [before, after] of [...list].reverse())
    if (source.includes(after)) source = source.replace(after, () => before)
  return source
}
function candidate(name, file) {
  let source = unpatch(installed(name, file), transforms[name])
  if (perf[name]) {
    source = unpatch(source, perf[name])
    assert.throws(() => patchSource(source, name), /performance patch first/)
    for (const [before, after, label] of perf[name])
      source = replaceChecked(source, before, after, label)
  }
  return patchSource(source, name)
}
function runtime(name, source) {
  const literal = source.match(new RegExp("var " + name + "_inline_default = (`[\\s\\S]*?`);"))[1]
  // FlexSearch embeds import.meta in its unused worker factory. Supply an explicit
  // module environment for this Function-based harness only.
  return new Function("return " + literal)().replace(
    /import\.meta/g,
    '({url:"https://example.test/search.js",dirname:"/"})',
  )
}

test("all six package copies: pristine + performance, repeat, runtime syntax, fail closed", () => {
  for (const name of Object.keys(transforms))
    for (const file of ["dist/index.js", "dist/components/index.js"]) {
      const source = candidate(name, file)
      assert.equal(patchSource(source, name), source)
      if (name !== "table-of-contents") new Function(runtime(name, source))
      for (const [before, after, label] of transforms[name]) {
        assert.throws(() => replaceChecked("", before, after, label), /unexpected source/)
        assert.throws(
          () => replaceChecked(before + before, before, after, label),
          /unexpected source/,
        )
      }
      if (name === "graph") {
        assert.match(source, /releaseGlobalResources:!1/)
        assert.match(source, /Retry graph/)
        assert.match(source, /await cayceLoadGraphLibraries\(\)/)
      }
    }
})

test("fresh bootstrap writes temp copies only and validates all before writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cayce-accessibility-"))
  for (const name of Object.keys(transforms))
    for (const file of ["dist/index.js", "dist/components/index.js"]) {
      const path = join(dir, "node_modules/@quartz-community", name, file)
      mkdirSync(join(path, ".."), { recursive: true })
      let source = unpatch(candidate(name, file), transforms[name])
      if (perf[name]) source = unpatch(source, perf[name])
      writeFileSync(path, source)
    }
  // Exercise both real CLI entry points on pristine temporary packaged copies.
  // Never rewrite the installation while other build/test workers are using it.
  for (const script of ["patch-quartz-performance.mjs", "patch-quartz-accessibility.mjs"]) {
    execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { cwd: dir })
  }
  for (const name of Object.keys(transforms))
    for (const file of ["dist/index.js", "dist/components/index.js"]) {
      assert.equal(
        readFileSync(join(dir, "node_modules/@quartz-community", name, file), "utf8"),
        candidate(name, file),
      )
    }
  patch(dir)
  patch(dir)
  const first = join(dir, "node_modules/@quartz-community/search/dist/index.js")
  const before = readFileSync(first, "utf8")
  writeFileSync(
    join(dir, "node_modules/@quartz-community/table-of-contents/dist/components/index.js"),
    "changed upstream",
  )
  assert.throws(() => patch(dir), /unexpected source/)
  assert.equal(readFileSync(first, "utf8"), before)
})

test("TOC spread preserves two distinct IDs and observer targets its own list", () => {
  const source = candidate("table-of-contents")
  const match = source.match(/OverflowList: \(props\) => ([^\n]+),/)
  const render = new Function("u2", "OverflowList", "id", "props", "return " + match[1])
  for (const id of ["toc-1", "toc-2"]) {
    const node = render((type, props) => props, "ul", "list-0", { id })
    assert.equal(node.id, id)
    assert.equal(node["data-cayce-overflow"], "list-0")
  }
  assert.match(source, /document.querySelector\('\[data-cayce-overflow=/)
})

// Optional local browser seam; no app server, build, network, or installed-package writes.
// CAYCE_PLAYWRIGHT=/tmp/cayce-audit-performance/node_modules/playwright/index.mjs
const browserModule = process.env.CAYCE_PLAYWRIGHT

test(
  "real DOM: packaged search arrows/Tab/Enter/Escape and graph modal focus",
  { skip: !browserModule },
  async () => {
    const { chromium } = await import(browserModule)
    const browser = await chromium.launch({ channel: "chrome", headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(
        '<button id="outside">Outside</button><div class="search"><button class="search-button">Search</button><div class="search-container"><div><input class="search-bar"><div class="search-layout" data-preview="false"></div></div></div></div><div class="global-graph-outer"><div class="global-graph-container"></div></div>',
      )
      await page.evaluate(() => {
        window.fetchData = Promise.resolve({
          "readings/1527-2": { title: "Atlantis reading", content: "Atlantis reference", tags: [] },
          "entities/Atlantis": { title: "Atlantis", content: "Atlantis topic", tags: [] },
        })
        window.addCleanup = () => {}
      })
      await page.addScriptTag({ content: runtime("search", candidate("search")) })
      await page.evaluate(() => document.dispatchEvent(new Event("nav")))
      await page.locator(".search-button").click()
      await page.locator(".search-bar").fill("Atlantis")
      await page.waitForFunction(() => document.querySelectorAll("a.result-card").length === 2)
      assert.equal(await page.locator(".results-container").getAttribute("role"), "region")
      await page.keyboard.press("ArrowDown")
      assert.equal(await page.evaluate(() => document.activeElement.matches("a.result-card")), true)
      await page.keyboard.press("ArrowUp")
      assert.equal(
        await page.evaluate(
          () => document.activeElement === document.querySelector("a.result-card"),
        ),
        true,
      )
      await page.keyboard.press("Tab")
      assert.equal(
        await page.evaluate(
          () => document.activeElement === document.querySelectorAll("a.result-card")[1],
        ),
        true,
      )
      await page.keyboard.press("Escape")
      assert.equal(
        await page.evaluate(() => document.activeElement.matches(".search-button")),
        true,
      )
      await page.locator(".search-button").click()
      await page.locator(".search-bar").fill("Atlantis")
      await page.waitForFunction(() => document.querySelectorAll("a.result-card").length === 2)
      await page.evaluate(() =>
        document.querySelectorAll("a.result-card").forEach((a) =>
          a.addEventListener("click", (e) => {
            e.preventDefault()
            window.clicked = a.dataset.slug
          }),
        ),
      )
      await page.keyboard.press("ArrowDown")
      await page.keyboard.press("Enter")
      assert.ok(await page.evaluate(() => window.clicked))
      await page.locator("#outside").focus()
      await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort())
      await page.evaluate(() => {
        const trigger = document.createElement("button")
        trigger.className = "global-graph-icon"
        trigger.textContent = "Global Graph"
        document.body.appendChild(trigger)
        document.querySelector(".global-graph-container").dataset.cfg = '{"depth":-1}'
      })
      await page.evaluate(
        (code) => {
          // Only storage is stubbed: the actual packaged event/render lifecycle runs.
          new Function("localStorage", code)({ getItem: () => null, setItem() {} })
        },
        runtime("graph", candidate("graph")),
      )
      await page.locator(".global-graph-icon").click()
      assert.equal(
        await page.getByRole("dialog", { name: "Global graph" }).getAttribute("aria-modal"),
        "true",
      )
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Close global graph",
      )
      await page.getByRole("button", { name: "Graph could not load. Retry graph" }).waitFor()
      await page.getByRole("button", { name: "Graph could not load. Retry graph" }).focus()
      await page.keyboard.press("Shift+Tab")
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Browse topics as text instead",
      )
      await page.keyboard.press("Tab")
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Graph could not load. Retry graph",
      )
      await page.keyboard.press("Escape")
      assert.equal(
        await page.evaluate(() => document.activeElement.matches(".global-graph-icon")),
        true,
      )
      assert.equal(
        await page.locator(".global-graph-outer").evaluate((el) => el.classList.contains("active")),
        false,
      )
      await page.locator(".global-graph-icon").click()
      await page.getByRole("button", { name: "Close global graph" }).click()
      assert.equal(
        await page.evaluate(() => document.activeElement.matches(".global-graph-icon")),
        true,
      )
    } finally {
      await browser.close()
    }
  },
)
