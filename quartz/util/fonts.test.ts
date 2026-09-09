import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import YAML from "yaml"
import { h } from "preact"
import { renderToString } from "preact-render-to-string"
import Head from "../components/Head"
import type { QuartzComponentProps } from "../components/types"
import { fetchGoogleFonts, googleFontHref, joinStyles, processGoogleFonts } from "./theme"

const config = YAML.parse(
  readFileSync(new URL("../../quartz.config.yaml", import.meta.url), "utf8"),
)
const theme = config.configuration.theme

test("self-hosted Head emits no Google stylesheet or connection hints", () => {
  const Component = Head()
  const html = renderToString(
    h(Component, {
      cfg: config.configuration,
      ctx: { cfg: { plugins: { emitters: [] } } },
      fileData: { slug: "readings/1-1", frontmatter: { title: "Reading" } },
      externalResources: { css: [], js: [], additionalHead: [] },
    } as unknown as QuartzComponentProps),
  )
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/)
})

test("core exclusively owns the site's self-hosted fonts", () => {
  assert.equal(theme.fontOrigin, "googleFonts")
  assert.equal(theme.cdnCaching, false)
  assert.equal(
    config.plugins.find((p: { source: string }) => p.source === "@quartz-community/quartz-fonts")
      .enabled,
    false,
  )
  assert.deepEqual(theme.typography, {
    header: "Schibsted Grotesk",
    body: "Source Sans Pro",
    code: "IBM Plex Mono",
  })
  assert.equal(
    googleFontHref(theme),
    "https://fonts.googleapis.com/css2?family=Schibsted Grotesk:wght@400;700&family=Source Sans Pro:ital,wght@0,400;0,600;1,400;1,600&family=IBM Plex Mono:wght@400;600&display=swap",
  )
})

test("downloaded font URLs resolve beside the root CSS on previews and subpath sites", async () => {
  const stylesheet =
    "@font-face { src: url(https://fonts.gstatic.com/s/example/v1/font-id.ttf) format('truetype'); }"
  const result = await processGoogleFonts(stylesheet, "nostem.github.io/cayce-wiki")
  assert.match(result.processedStylesheet, /url\(\.\/static\/fonts\/font-id.ttf\)/)
  assert.equal(result.fontFiles.length, 1)
  assert.deepEqual(result.fontFiles[0], {
    url: "https://fonts.gstatic.com/s/example/v1/font-id.ttf",
    filename: "font-id",
    extension: "ttf",
  })
  for (const root of [
    "http://localhost:8080/",
    "https://preview.example/",
    "https://nostem.github.io/cayce-wiki/",
  ]) {
    assert.equal(
      new URL("./static/fonts/font-id.ttf", `${root}index-hash.css`).href,
      `${root}static/fonts/font-id.ttf`,
    )
  }
})

test("build fetch requests WOFF2 and preserves every unicode subset and face", async () => {
  const css = ["U+0000-00FF", "U+0400-045F", "U+1F00-1FFF"]
    .map(
      (range, i) =>
        `@font-face { font-family: 'Example'; font-style: italic; font-weight: 600; font-display: swap; src: url(https://fonts.gstatic.com/s/example/v1/subset-${i}.woff2) format('woff2'); unicode-range: ${range}; }`,
    )
    .join("\n")
  const url = googleFontHref(theme)
  const mockFetch: typeof fetch = async (input, init) => {
    assert.equal(input, url)
    const headers = new Headers(init?.headers)
    assert.match(headers.get("user-agent") ?? "", /Chrome\/120\.0\.0\.0/)
    assert.match(headers.get("accept") ?? "", /text\/css/)
    return new Response(css)
  }
  const result = await fetchGoogleFonts(url, "example.com", mockFetch)
  assert.equal(result.fontFiles.length, 3)
  assert.ok(result.fontFiles.every((file) => file.extension === "woff2"))
  assert.equal(
    result.processedStylesheet,
    css.replaceAll("https://fonts.gstatic.com/s/example/v1/", "./static/fonts/"),
  )
})

for (const [name, body, status, error] of [
  ["HTTP failure", "upstream failure", 503, /Google Fonts.*503/],
  ["empty stylesheet", "", 200, /No fonts/],
  [
    "unrecognized source",
    "@font-face { src: url(https://fonts.gstatic.com/s/font.unknown); }",
    200,
    /No fonts|Unprocessed/,
  ],
  [
    "format downgrade",
    "@font-face { src: url(https://fonts.gstatic.com/s/example/v1/font.ttf) format('truetype'); }",
    200,
    /WOFF2/,
  ],
] as const) {
  test(`build rejects ${name}`, async () => {
    const mockFetch: typeof fetch = async () => new Response(body, { status })
    await assert.rejects(fetchGoogleFonts(googleFontHref(theme), "example.com", mockFetch), error)
  })
}

test("parser rejects partially processed stylesheets", async () => {
  await assert.rejects(
    processGoogleFonts(
      "@font-face { src: url(https://fonts.gstatic.com/s/example/v1/font.woff2) format('woff2'); } @font-face { src: url(https://fonts.gstatic.com/s/unparsed); }",
      "example.com",
    ),
    /Unprocessed/,
  )
})

test("title kit URLs stay relative and shared files are downloaded only once", async () => {
  const face =
    "@font-face { src: url(https://fonts.gstatic.com/l/font?kit=title-id&skey=key&v=v7) format('woff2'); }"
  const result = await processGoogleFonts(`${face}\n${face}`, "example.com")
  assert.equal(result.fontFiles.length, 1)
  assert.equal(result.fontFiles[0].filename, "title-id")
  assert.equal(result.fontFiles[0].extension, "woff2")
  assert.equal(
    (result.processedStylesheet.match(/\.\/static\/fonts\/title-id\.woff2/g) ?? []).length,
    2,
  )
})

test("core keeps theme aliases and inserts measured fallbacks after the original families", () => {
  const css = joinStyles(theme)
  assert.match(css, /--bodyFont: "Source Sans Pro", "Source Sans Pro Fallback", system-ui/)
  assert.match(css, /--headerFont: "Schibsted Grotesk", "Schibsted Grotesk Fallback", system-ui/)
  assert.match(css, /--titleFont: "Schibsted Grotesk", "Schibsted Grotesk Fallback", system-ui/)
  assert.match(css, /--font-text: var\(--bodyFont\)/)
  assert.match(css, /--font-interface: var\(--bodyFont\)/)
  assert.match(css, /--codeFont: "IBM Plex Mono", ui-monospace/)
})
