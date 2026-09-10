import type { QuartzComponentProps } from "../types"
import { readingIdentity } from "./reading"

/** No attached resource strings: styles are imported by the parent stylesheet. */
export function ReaderHeader({ tree, fileData }: QuartzComponentProps) {
  // NotFound owns its recovery masthead; do not duplicate emitter-owned titles.
  if (fileData.slug === "404") return null
  const identity = readingIdentity(tree, fileData.frontmatter, fileData.slug)
  return (
    <div class="reader-header">
      <h1>{identity.title}</h1>
      {identity.originalDate && (
        <p class="reader-identity">Original date: {identity.originalDate}</p>
      )}
      {identity.isReading && (
        <div class="reader-annotation-controls">
          <p class="reader-source-note">
            Historical transcript · topic links and synopsis are generated annotations.
          </p>
          <button type="button" data-annotation-toggle aria-pressed="false">
            Unannotated view
          </button>
          <p data-annotation-status role="status">
            Generated topic links enabled; associations may be mistaken.
          </p>
        </div>
      )}
      {identity.synopsis && (
        <details class="reader-synopsis">
          <summary>Generated synopsis</summary>
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

export function ReaderEndMatter({ tree, fileData }: QuartzComponentProps) {
  const identity = readingIdentity(tree, fileData.frontmatter, fileData.slug)
  if (!identity.isReading) return null
  return (
    <section class="reader-endmatter" aria-labelledby="citation-heading">
      <h2 id="citation-heading">Citation and provenance</h2>
      <p>
        Edgar Cayce, {identity.title}
        {identity.originalDate ? `, ${identity.originalDate}` : ""}. Cite the numbered paragraph
        when available and include this page’s URL and your access date.
      </p>
      <p>
        Transcript wording and paragraph numbers are retained. Topic links and the generated
        synopsis are research aids, not part of the original reading; associations may be mistaken.
        Historical medical material is not current treatment guidance.
      </p>
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
