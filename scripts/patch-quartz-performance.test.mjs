import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

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
