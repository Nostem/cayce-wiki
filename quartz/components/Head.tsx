import { i18n } from "../i18n"
import { FullSlug, getFileExtension, joinSegments, pathToRoot } from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import { googleFontHref, googleFontSubsetHref } from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { unescapeHTML } from "../util/escape"

export default (() => {
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
  }: QuartzComponentProps) => {
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const fm = (fileData.frontmatter ?? {}) as Record<string, unknown>
    const slug = String(fileData.slug ?? "")
    const readingId = typeof fm.reading === "string" ? fm.reading : undefined
    const isReading = slug.startsWith("readings/") && !!readingId
    const seriesTitle = typeof fm.series_title === "string" ? fm.series_title : undefined
    const year = fm.year !== undefined && fm.year !== null ? String(fm.year) : undefined
    const summary = typeof fm.summary === "string" ? fm.summary.trim() : undefined
    const readingTitle = isReading
      ? [
          `Reading ${readingId}`,
          year,
          seriesTitle && seriesTitle.length < 80 ? seriesTitle : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined
    const fallbackDescription =
      slug === "index"
        ? "A reading library for exploring the Edgar Cayce transcripts, following subjects through the archive, and returning to the source."
        : slug === "entities" || slug.startsWith("entities/")
          ? "Browse people, places, concepts and remedies indexed across the Cayce readings. Indexes are research aids, not claims."
          : slug === "readings" || slug.startsWith("readings/")
            ? "Browse the Edgar Cayce readings by number or jump to a known identifier."
            : slug === "series" || slug.startsWith("series/")
              ? "Series titles and membership follow the source index of the Cayce readings."
              : i18n(cfg.locale).propertyDefaults.description
    const title =
      (readingTitle ??
        (typeof fm.title === "string" ? fm.title : undefined) ??
        i18n(cfg.locale).propertyDefaults.title) + titleSuffix
    const extracted = unescapeHTML(fileData.description?.trim() || "")
    const description =
      (typeof fm.socialDescription === "string" ? fm.socialDescription : undefined) ??
      (typeof fm.description === "string" ? fm.description : undefined) ??
      (isReading && summary ? summary : undefined) ??
      (extracted || fallbackDescription)

    const { css, js, additionalHead } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/icon.png")

    // Url of current page
    const socialUrl =
      fileData.slug === "404" ? url.toString() : joinSegments(url.toString(), fileData.slug!)

    const usesCustomOgImage = ctx.cfg.plugins.emitters.some((e) => e.name === "CustomOgImages")
    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`

    const coreStylesheet = css[0]?.content
    const coreScript = js.find(
      (r) => r.loadTime === "beforeDOMReady" && r.contentType === "external",
    )

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {coreStylesheet && <link rel="preload" href={coreStylesheet} as="style" />}
        {coreScript && coreScript.contentType === "external" && (
          <link rel="preload" href={coreScript.src} as="script" />
        )}
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
            {cfg.theme.typography.title && (
              <link rel="stylesheet" href={googleFontSubsetHref(cfg.theme, cfg.pageTitle)} />
            )}
          </>
        )}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <meta name="og:site_name" content={cfg.pageTitle}></meta>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta property="og:description" content={description} />
        <meta property="og:image:alt" content={description} />

        {!usesCustomOgImage && (
          <>
            <meta property="og:image" content={ogImageDefaultPath} />
            <meta property="og:image:url" content={ogImageDefaultPath} />
            <meta name="twitter:image" content={ogImageDefaultPath} />
            <meta
              property="og:image:type"
              content={`image/${(getFileExtension(ogImageDefaultPath) ?? ".png").replace(/^\./, "")}`}
            />
          </>
        )}

        {cfg.baseUrl && (
          <>
            <meta property="twitter:domain" content={cfg.baseUrl}></meta>
            <meta property="og:url" content={socialUrl}></meta>
            <meta property="twitter:url" content={socialUrl}></meta>
          </>
        )}

        <link rel="icon" href={iconPath} />
        <meta name="description" content={description} />
        <meta name="generator" content="Quartz" />

        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
        {additionalHead.map((resource) => {
          if (typeof resource === "function") {
            return resource(fileData)
          } else {
            return resource
          }
        })}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
