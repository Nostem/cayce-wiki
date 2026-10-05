import type { QuartzComponentProps } from "../types"
import { readingIdentity } from "./reading"
import { naturalCompare, readingCaseId } from "./catalog"
import { relatedReadingsFor } from "./related"

function caseSpine(reading: string, allFiles: QuartzComponentProps["allFiles"], fm: Record<string, unknown>) {
  const caseId = readingCaseId(reading)
  if (!caseId) return null
  const siblings = allFiles
    .map((file) => {
      const id = file.frontmatter?.reading
      return typeof id === "string" && file.slug?.startsWith("readings/") ? id : undefined
    })
    .filter((id): id is string => !!id && readingCaseId(id) === caseId)
    .sort(naturalCompare)
  const unique = [...new Set(siblings)]
  const idx = unique.indexOf(reading)
  const prev = idx > 0 ? unique[idx - 1] : undefined
  const next = idx >= 0 && idx < unique.length - 1 ? unique[idx + 1] : undefined
  const series = fm.series != null ? String(fm.series) : undefined
  const seriesSlug = series
    ? allFiles.find(
        (file) =>
          file.slug?.startsWith("series/") &&
          !file.slug.includes("/page/") &&
          String(file.frontmatter?.series ?? "") === series,
      )?.slug
    : undefined
  const shortSeries = series ? `series/${series}` : undefined
  const person = allFiles.find((file) => {
    const entity = file.frontmatter?.entity
    return (
      file.slug?.startsWith("entities/") &&
      (entity === `[${caseId}]` || entity === caseId || file.slug === `entities/${caseId}`)
    )
  })
  if (!prev && !next && !seriesSlug && !shortSeries && !person && unique.length <= 1) return null
  return { caseId, prev, next, series, seriesHref: shortSeries ?? seriesSlug, personSlug: person?.slug, total: unique.length }
}

/** No attached resource strings: styles are imported by the parent stylesheet. */
export function ReaderHeader({ tree, fileData, allFiles = [] }: QuartzComponentProps) {
  // NotFound owns its recovery masthead; do not duplicate emitter-owned titles.
  if (fileData.slug === "404") return null
  const identity = readingIdentity(tree, fileData.frontmatter, fileData.slug)
  const fm = (fileData.frontmatter ?? {}) as Record<string, unknown>
  const spine = identity.isReading && identity.reading ? caseSpine(identity.reading, allFiles, fm) : null
  return (
    <div class="reader-header">
      <h1>{identity.title}</h1>
      {identity.originalDate && (
        <p class="reader-identity">Original date: {identity.originalDate}</p>
      )}
      {spine && (
        <nav class="reader-case-spine" aria-label="Case navigation">
          <span class="reader-case-label">Case {spine.caseId}</span>
          {spine.prev && (
            <>
              {" · "}
              <a class="internal" href={`/readings/${spine.prev}`} rel="prev">
                Previous ({spine.prev})
              </a>
            </>
          )}
          {spine.next && (
            <>
              {" · "}
              <a class="internal" href={`/readings/${spine.next}`} rel="next">
                Next ({spine.next})
              </a>
            </>
          )}
          {spine.seriesHref && (
            <>
              {" · "}
              <a class="internal" href={`/${spine.seriesHref}`}>
                Series {spine.series} timeline
              </a>
            </>
          )}
          {spine.personSlug && (
            <>
              {" · "}
              <a class="internal" href={`/${spine.personSlug}`}>
                Person index
              </a>
            </>
          )}
          {spine.total > 1 && (
            <span class="reader-case-count"> · {spine.total} readings in this case</span>
          )}
        </nav>
      )}
      {identity.isReading && (
        <div class="reader-annotation-controls">
          <p class="reader-source-note">
            Historical transcript · topic links and synopsis are generated annotations — not part of
            the citable source.
          </p>
          <button type="button" data-annotation-toggle aria-pressed="false">
            Unannotated view
          </button>
          <p class="reader-annotation-hint">
            Prefer unannotated wording when quoting. Generated links can be wrong.
          </p>
          <p data-annotation-status role="status">
            Generated topic links enabled; associations may be mistaken.
          </p>
        </div>
      )}
      {identity.synopsis && (
        <details class="reader-synopsis">
          <summary>Generated synopsis (research aid — not source text)</summary>
          <p>{identity.synopsis}</p>
        </details>
      )}
      {!("libraryCatalog" in fileData && fileData.libraryCatalog) &&
        identity.sections.length > 0 && (
          <details class="reader-sections">
            <summary>On this page</summary>
            <nav aria-label="On this page">
              <ul>
                {identity.sections.map(({ id, label }) => (
                  <li key={id}>
                    <a href={`#${id}`}>{label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        )}
    </div>
  )
}

export function ReaderEndMatter({ tree, fileData, allFiles = [] }: QuartzComponentProps) {
  const identity = readingIdentity(tree, fileData.frontmatter, fileData.slug)
  if (!identity.isReading || !identity.reading) return null
  const related = relatedReadingsFor(identity.reading, allFiles)
  return (
    <section class="reader-endmatter" aria-labelledby="citation-heading">
      <h2 id="citation-heading">Citation and provenance</h2>
      <p>
        Edgar Cayce, {identity.title}
        {identity.originalDate ? `, ${identity.originalDate}` : ""}. Cite the numbered paragraph
        when available (for example <code>#p3</code> or <code>#r1</code> on this page) and include
        this page’s URL and your access date. Do not cite the generated synopsis or topic graph as
        the source.
      </p>
      <p>
        Transcript wording and paragraph numbers are retained. Topic links and the generated
        synopsis are research aids, not part of the original reading; associations may be mistaken.
        Historical medical material is not current treatment guidance.
      </p>
      {related.length > 0 && (
        <nav class="reader-related" aria-labelledby="related-readings-heading">
          <h2 id="related-readings-heading">Related readings</h2>
          <p class="reader-related-note">
            Compact overlaps from shared named topics in reading metadata — not a claim that the
            cases are the same. Verify in the source. The full graph remains optional exploration.
          </p>
          <ul>
            {related.map((item) => (
              <li key={item.id}>
                <a class="internal" href={`/${item.slug}`}>
                  Reading {item.id}
                </a>
                <span class="reader-related-meta">
                  {" "}
                  · {item.score} shared topic{item.score === 1 ? "" : "s"}
                  {item.shared.length ? ` (${item.shared.join(", ")})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <details class="reader-properties">
        <summary>Technical properties</summary>
        <dl>
          {Object.entries(fileData.frontmatter ?? {})
            .filter(([key]) => !["title", "summary"].includes(key))
            .map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
              </div>
            ))}
        </dl>
      </details>
    </section>
  )
}
