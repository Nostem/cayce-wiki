import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  transforms as accessibilityTransforms,
  patchSource as patchAccessibility,
} from "./patch-quartz-accessibility.mjs"

// Installed copies may contain both patches. Undo later transforms first so
// the performance-only runtime harness really starts from pristine input.
// Keep exact/count-checked reversals: unknown or duplicated fragments fail.
function undoAccessibility(source, replaceOnce) {
  if (!accessibilityTransforms.graph.some(([, after]) => source.includes(after))) return source
  for (const [before, after, label] of [...accessibilityTransforms.graph].reverse()) {
    if (source.includes(after)) source = replaceOnce(source, after, before, label)
    else replaceOnce(source, before, before, label)
  }
  return source
}

// Evaluate declarations only: regression tests must never patch node_modules.
function graphPatch() {
  const declarations = patchSource
    .slice(0, patchSource.indexOf('\npatchFile("node_modules/'))
    .replace(/^#!.*$/gm, "")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "")
  return new Function(
    `${declarations}; return { graphTransforms, replaceOnce, load: typeof cayceLoadGraphLibraries === 'function' ? cayceLoadGraphLibraries : null }`,
  )()
}

test("both packaged graph copies remove eager library initialization exactly once", () => {
  const { graphTransforms, replaceOnce } = graphPatch()
  for (const path of ["dist/index.js", "dist/components/index.js"]) {
    let source = readFileSync(
      new URL(`../node_modules/@quartz-community/graph/${path}`, import.meta.url),
      "utf8",
    )
    source = undoAccessibility(source, replaceOnce)
    for (const [before, after] of [...graphTransforms].reverse()) {
      if (source.includes(after)) source = source.replace(after, () => before)
    }
    for (const [before, after, label] of graphTransforms) {
      // npm test may run after the parent has applied the durable patch.
      source = source.includes(before)
        ? replaceOnce(source, before, after, label)
        : replaceOnce(source, after, after, label + " (already patched)")
      assert.throws(() => replaceOnce(before + before, before, after, label), /not unique/)
      assert.throws(() => replaceOnce("", before, after, label), /not found/)
    }
    assert.doesNotMatch(source, /Promise\.all\(\[e\("https:/)
    assert.match(source, /d3@7\.9\.0\/dist\/d3\.min\.js/)
    assert.match(source, /pixi\.js@8\.20\.1\/dist\/pixi\.min\.js/)
    assert.match(source, /await cayceLoadGraphLibraries\(\)/)
    assert.match(source, /Loading graph…/)
    assert.match(source, /Retry graph/)
    assert.equal(
      undoAccessibility(source, replaceOnce),
      source,
      "performance-only fixture is unchanged",
    )
    const combined = patchAccessibility(source, "graph")
    assert.equal(
      patchAccessibility(combined, "graph"),
      combined,
      "combined patch is accessibility-idempotent",
    )
    assert.equal(
      undoAccessibility(combined, replaceOnce),
      source,
      "both packaged copies restore the exact performance fixture",
    )
    const cleanup = "function(){E++;G();f(),b()}"
    assert.throws(() => undoAccessibility(combined + cleanup, replaceOnce), /not unique/)
    assert.throws(
      () =>
        undoAccessibility(combined.replace(cleanup, "function(){unknownCleanup()}"), replaceOnce),
      /not found/,
    )
  }
})

test("graph dependencies stay idle, coalesce clicks and retry only a failed library", async () => {
  const { load } = graphPatch()
  assert.equal(typeof load, "function", "lazy graph loader is available for behavioral testing")
  const scripts = []
  const window = {}
  const document = {
    createElement: () => ({
      remove() {
        this.removed = true
      },
    }),
    head: {
      appendChild(s) {
        scripts.push(s)
      },
    },
  }
  const initialize = new Function("window", "document", `return (${load.toString()})`)(
    window,
    document,
  )
  assert.equal(scripts.length, 0)
  const a = initialize(),
    b = initialize()
  assert.equal(scripts.length, 2)
  window.d3 = {}
  scripts[0].onload()
  scripts[1].onerror()
  await Promise.all([assert.rejects(a), assert.rejects(b)])
  assert.equal(scripts[1].removed, true)
  const retry = initialize()
  assert.equal(scripts.length, 3)
  window.PIXI = {}
  scripts[2].onload()
  await retry
  await initialize()
  assert.equal(scripts.length, 3)
})

function createGraphRuntime({ libraries = {}, graphData, runtimeGlobals = {} } = {}) {
  const { graphTransforms, replaceOnce } = graphPatch()
  let source = readFileSync(
    new URL("../node_modules/@quartz-community/graph/dist/index.js", import.meta.url),
    "utf8",
  )
  source = undoAccessibility(source, replaceOnce)
  for (const [before, after] of [...graphTransforms].reverse()) {
    if (source.includes(after)) source = source.replace(after, () => before)
  }
  for (const [before, after, label] of graphTransforms) {
    source = source.includes(before)
      ? replaceOnce(source, before, after, label)
      : replaceOnce(source, after, after, label)
  }
  const literal = source.match(/var graph_inline_default = (`[\s\S]*?`);/)[1]
  const runtime = new Function(`return ${literal}`)()
  const events = new Map(),
    scripts = []
  function element() {
    const listeners = new Map(),
      classes = new Set()
    return {
      children: [],
      appended: [],
      offsetWidth: 600,
      offsetHeight: 400,
      style: {},
      dataset: { cfg: '{"depth":1}' },
      isConnected: true,
      get firstChild() {
        return this.children[0]
      },
      appendChild(child) {
        this.children.push(child)
        this.appended.push(child)
        child.parentNode = this
      },
      removeChild(child) {
        this.children.splice(this.children.indexOf(child), 1)
        child.parentNode = null
      },
      addEventListener(name, fn) {
        listeners.set(name, fn)
      },
      removeEventListener(name) {
        listeners.delete(name)
      },
      click() {
        listeners.get("click")?.()
      },
      setAttribute() {},
      remove() {
        this.parentNode?.removeChild(this)
      },
      closest() {
        return null
      },
      classList: {
        add: (n) => classes.add(n),
        remove: (n) => classes.delete(n),
        contains: (n) => classes.has(n),
      },
    }
  }
  const local = element(),
    global = element(),
    outer = element(),
    icon = element()
  outer.querySelector = () => global
  const document = {
    body: { dataset: {} },
    readyState: "complete",
    createElement: element,
    querySelectorAll: (selector) =>
      ({
        ".graph-container": [local],
        ".global-graph-outer": [outer],
        ".global-graph-icon": [icon],
      })[selector] || [],
    addEventListener(name, fn) {
      events.set(name, fn)
    },
    removeEventListener() {},
    head: {
      appendChild(s) {
        scripts.push(s)
      },
    },
  }
  const window = { location: { pathname: "/readings/1527-2" }, ...libraries }
  let fetches = 0,
    resolveData
  const fetch = () => {
    fetches++
    if (graphData) return Promise.resolve({ ok: true, json: async () => graphData })
    return new Promise((resolve) => {
      resolveData = resolve
    })
  }
  new Function(
    "window",
    "document",
    "localStorage",
    "fetch",
    ...Object.keys(runtimeGlobals),
    runtime,
  )(
    window,
    document,
    { getItem: () => null, setItem() {} },
    fetch,
    ...Object.values(runtimeGlobals),
  )
  const flush = () => new Promise((resolve) => setImmediate(resolve))
  return {
    events,
    scripts,
    local,
    global,
    outer,
    icon,
    window,
    flush,
    element,
    get fetches() {
      return fetches
    },
    resolveData: (data) => resolveData(data),
  }
}

test("packaged runtime installs controls before libraries and cancels stale SPA work", async () => {
  const harness = createGraphRuntime()
  const { events, scripts, local, global, outer, icon, window, flush, resolveData } = harness
  assert.equal(scripts.length, 0)
  assert.equal(harness.fetches, 0)
  assert.equal(local.firstChild.textContent, "Load local graph")
  local.firstChild.click()
  icon.click()
  assert.equal(scripts.length, 2, "local/global clicks share both requests")
  assert.equal(local.firstChild.textContent, "Loading graph…")
  assert.equal(global.firstChild.textContent, "Loading graph…")
  // Exercise the real local/global retry controls, not just the loader helper.
  window.PIXI = {}
  scripts[1].onload()
  scripts[0].onerror()
  await flush()
  assert.match(local.firstChild.textContent, /Retry graph/)
  assert.match(global.firstChild.textContent, /Retry graph/)
  local.firstChild.click()
  global.firstChild.click()
  assert.equal(scripts.length, 3, "retry reloads only failed D3 and coalesces both controls")
  events.get("prenav")()
  window.d3 = {}
  scripts[2].onload()
  await flush()
  assert.equal(harness.fetches, 0, "old route cannot fetch data after libraries arrive")
  outer.classList.remove("active")
  events.get("nav")({ detail: { url: "readings/new" } })
  local.firstChild.click()
  await flush()
  assert.equal(harness.fetches, 1)
  assert.equal(scripts.length, 3, "new route reuses loaded libraries")
  assert.equal(local.firstChild.textContent, "Loading graph…", "feedback remains during data load")
  events.get("prenav")()
  resolveData({ ok: true, json: async () => ({}) })
  await flush()
  assert.equal(local.children.length, 1, "stale data never creates a Pixi application")
})

test("packaged runtime destroys a stale pending Pixi init once and keeps the reopened graph live", async (t) => {
  const apps = [],
    simulations = [],
    frames = [],
    errors = []
  const point = () => ({
    set(x, y = x) {
      this.x = x
      this.y = y
    },
  })
  class Container {
    children = []
    position = point()
    scale = point()
    addChild(child) {
      this.children.push(child)
    }
  }
  class Graphics extends Container {
    listeners = new Map()
    circle() {}
    fill() {}
    on(name, callback) {
      this.listeners.set(name, callback)
    }
  }
  class Text extends Container {
    anchor = point()
  }
  class Application {
    canvas = {
      remove() {
        this.parentNode?.removeChild(this)
      },
    }
    stage = new Container()
    destroyCalls = []
    constructor() {
      apps.push(this)
    }
    init(options) {
      this.initOptions = options
      return new Promise((resolve) => {
        this.releaseInit = resolve
      })
    }
    destroy(rendererOptions, childOptions) {
      this.destroyCalls.push([rendererOptions, childOptions])
      if (rendererOptions.removeView) this.canvas.remove()
    }
  }
  const force = () => ({
    strength() {
      return this
    },
    distance() {
      return this
    },
    radius() {
      return this
    },
    iterations() {
      return this
    },
  })
  const d3 = {
    forceManyBody: force,
    forceCenter: force,
    forceLink: force,
    forceCollide: force,
    zoomIdentity: { x: 0, y: 0, k: 1 },
    forceSimulation(nodes) {
      const simulation = {
        nodes,
        restarted: false,
        stopped: false,
        force() {
          return this
        },
        on() {
          return this
        },
        restart() {
          this.restarted = true
          return this
        },
        stop() {
          this.stopped = true
        },
      }
      simulations.push(simulation)
      return simulation
    },
  }
  const harness = createGraphRuntime({
    libraries: { d3, PIXI: { Application, Container, Graphics, Text } },
    graphData: { "readings/1527-2": { title: "Reading", global: true, globalLinks: [] } },
    runtimeGlobals: {
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      requestAnimationFrame: (callback) => {
        frames.push(callback)
      },
      console: { error: (...args) => errors.push(args), log() {} },
    },
  })
  const { icon, outer, global, events, flush, window } = harness
  global.dataset.cfg = '{"depth":-1,"drag":false,"zoom":false}'
  t.after(() => events.get("prenav")())
  const destroyOptions = [{ removeView: true, releaseGlobalResources: false }, { children: true }]

  icon.click()
  await flush()
  assert.equal(apps.length, 1, "first open reaches the real runtime's deferred Application.init")
  const stale = apps[0]
  assert.equal(stale.initOptions.width, 600)
  assert.equal(global.firstChild.textContent, "Loading graph…")
  icon.click()
  assert.equal(outer.classList.contains("active"), false)
  icon.click()
  await flush()
  assert.equal(outer.classList.contains("active"), true)
  assert.equal(apps.length, 2, "reopen starts a distinct pending application")
  const current = apps[1],
    loading = global.firstChild
  assert.deepEqual(stale.destroyCalls, [], "pending init is not destroyed prematurely")
  assert.deepEqual(current.destroyCalls, [])

  stale.releaseInit()
  await flush()
  assert.deepEqual(
    stale.destroyCalls,
    [destroyOptions],
    "stale app is destroyed exactly once without global release",
  )
  assert.equal(
    global.appended.includes(stale.canvas),
    false,
    "stale canvas was never attached, even transiently",
  )
  assert.equal(global.firstChild, loading, "stale completion cannot erase the newest loading UI")
  assert.equal(simulations.length, 0, "stale app never starts a simulation")

  current.releaseInit()
  await flush()
  assert.deepEqual(errors, [], "newest render completes without falling into retry UI")
  assert.deepEqual(global.children, [current.canvas])
  assert.equal(global.style.display, "block")
  assert.deepEqual(current.destroyCalls, [])
  assert.equal(simulations.length, 1)
  assert.equal(simulations[0].restarted, true)
  assert.equal(simulations[0].stopped, false)
  const node = current.stage.children[0].children[1].children[0]
  simulations[0].nodes[0].x = 10
  simulations[0].nodes[0].y = 20
  assert.equal(frames.length, 1)
  frames.shift()()
  assert.deepEqual({ x: node.position.x, y: node.position.y }, { x: 310, y: 220 })
  node.listeners.get("click")()
  assert.equal(window.location.href, "/readings/1527-2", "new graph node remains interactive")
  assert.equal(harness.fetches, 1, "reopen shares the graph data request")

  icon.click()
  assert.equal(simulations[0].stopped, true)
  assert.deepEqual(current.destroyCalls, [destroyOptions])
  assert.equal(global.children.length, 0)
  events.get("prenav")()
  assert.deepEqual(
    stale.destroyCalls,
    [destroyOptions],
    "later cleanup never double-destroys stale app",
  )
  assert.deepEqual(
    current.destroyCalls,
    [destroyOptions],
    "closed app is not destroyed again on navigation",
  )
  assert.equal(global.appended.includes(stale.canvas), false)
  frames.shift()()
  assert.equal(frames.length, 0, "closed graph stops scheduling frames")
})

test("closing a graph preserves checked-out Pixi batches and the other app's ticker", () => {
  const { graphTransforms } = graphPatch()
  // Mirror Pixi 8.20.1's pool ownership, not just an Application.destroy spy:
  // getBatchFromPool decrements the cursor without removing the array entry;
  // GlobalResourceRegistry.release destroys every entry, including live batches.
  function scenario(cleanup) {
    const batch = { textures: { clear() {} } }
    const pool = [batch]
    const local = { ticker: { started: true }, batch }
    const global = {
      ticker: { started: true },
      destroy(rendererOptions, childOptions) {
        this.ticker.started = false
        this.removed = rendererOptions === true || rendererOptions.removeView
        this.childrenDestroyed = childOptions?.children === true
        if (rendererOptions === true || rendererOptions.releaseGlobalResources) {
          for (const entry of pool) entry.textures = null
        }
      },
    }
    new Function("Z", cleanup)(global)
    // Next local begin/buildEnd returns and reuses its checked-out batch.
    local.batch.textures.clear()
    assert.equal(local.ticker.started, true)
    assert.equal(global.ticker.started, false)
    assert.equal(global.removed, true)
    assert.equal(global.childrenDestroyed, true)
  }
  const [, cleanup] = graphTransforms.find(([, , label]) =>
    label.startsWith("dispose graph children"),
  )
  assert.throws(() => scenario("Z.destroy(true)"), /clear/)
  assert.doesNotThrow(() => scenario(cleanup))
  const [, stale] = graphTransforms.find(([, , label]) =>
    label.startsWith("dispose stale applications"),
  )
  assert.doesNotThrow(() => scenario("function cayceValid(){return false}" + stale))
})

const patchSource = readFileSync(new URL("./patch-quartz-performance.mjs", import.meta.url), "utf8")

function searchInitializerSource() {
  const match = patchSource.match(/export const searchInitAfter =\s*(["'])(.*?)\1/s)
  assert.ok(match, "the search initializer replacement must be exported for regression testing")
  return match[2]
}

function createInitializer({ failFirstBuild = false } = {}) {
  let fetches = 0
  let builds = 0
  let shouldFail = failFirstBuild
  const bi = async () => {
    fetches++
    await new Promise((resolve) => setTimeout(resolve, 5))
    return { index: true }
  }
  const ki = async () => {
    builds++
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (shouldFail) {
      shouldFail = false
      throw new Error("build failed")
    }
  }
  const initializer = new Function(
    "bi",
    "ki",
    `let Z; ${searchInitializerSource()}; return { initialize: Ti, ready: () => Rt }`,
  )(bi, ki)
  return {
    ...initializer,
    counts: () => ({ fetches, builds }),
  }
}

test("coalesces concurrent search initialization into one index build", async () => {
  const initializer = createInitializer()

  await Promise.all(Array.from({ length: 8 }, () => initializer.initialize()))

  assert.deepEqual(initializer.counts(), { fetches: 1, builds: 1 })
  assert.equal(initializer.ready(), true)
})

test("guards concurrent input before search and stale results after search", () => {
  assert.match(patchSource, /window\.__cayceSearchRequest=\(window\.__cayceSearchRequest\|\|0\)\+1/)
  assert.equal(patchSource.match(/cayceRequest!==window\.__cayceSearchRequest/g)?.length, 2)
  assert.match(patchSource, /discard stale asynchronous search results/)
  assert.match(patchSource, /Loading search…/)
})

test("allows search initialization to retry after a failed build", async () => {
  const initializer = createInitializer({ failFirstBuild: true })

  await assert.rejects(initializer.initialize(), /build failed/)
  await initializer.initialize()

  assert.deepEqual(initializer.counts(), { fetches: 2, builds: 2 })
  assert.equal(initializer.ready(), true)
})
