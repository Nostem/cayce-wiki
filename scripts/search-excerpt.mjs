// Operates only on the full text already supplied by Quartz's content index.
// Keep all context in `content`: no extra client field or corpus/file lookup.

const READING_TYPE_PATTERNS = [
  [/\(\s*Check\s+Physical[^)]*\)/i, "Physical"],
  [/\(\s*Physical\s+Suggestion\s*\)/i, "Physical"],
  [/\(\s*Physical\s+Reading\s*\)/i, "Physical"],
  [/\(\s*Life\s+Reading\s*\)/i, "Life"],
  [/\(\s*Business\s+Reading\s*\)/i, "Business"],
  [/\(\s*Dream\s+Reading\s*\)/i, "Dream"],
  [/\(\s*Mental[-\s]?Spiritual[^)]*\)/i, "Mental-Spiritual"],
  [/\(\s*Aura\s+Chart[^)]*\)/i, "Aura"],
]

function compact(text, limit) {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= limit) return flat
  if (limit <= 1) return limit === 1 ? "…" : ""
  let cut = flat.slice(0, limit - 1)
  const space = cut.lastIndexOf(" ")
  if (space > limit * 0.6) cut = cut.slice(0, space)
  return cut + "…"
}

export function detectReadingType(text) {
  const section = text.split(/\s+Reports(?: & Follow-up)?\b|\s+Background\b/)[0] ?? text
  for (const [pattern, label] of READING_TYPE_PATTERNS) {
    if (pattern.test(section)) return label
  }
  return undefined
}

export function searchExcerpt(slug, item, limit = 180) {
  if (typeof item.content !== "string") return ""
  const text = item.content.replace(/\s+/g, " ").trim()
  if (!slug.startsWith("readings/")) {
    // Retain the entity/topic's identity and lead, not its trailing reading list.
    const lead = text.split(
      /\s+Readings mentioning\s+|\s+(?:Readings|Related Readings|Mentioned in|Reading References)\s+(?=\d+-\d+\b)/i,
    )[0]
    return compact(lead, limit)
  }

  // Reports/background can contain dated correspondence and numbered lists.
  const reading = text.split(
    /\s+(?:Reports(?: & Follow-up)?|Background|Index \(LLM-extracted\))\b/,
  )[0]
  const first = /(?:^|\s)1\.\s+(?=\S)/.exec(reading)
  // Quartz strips ordered-list markers from its text index. The archival EC
  // speaker label survives, so use it when the numbered raw-text form is absent.
  const speaker = /(?:^|\s)EC:\s+/.exec(reading)
  const opening = reading.slice(0, first?.index ?? speaker?.index ?? reading.length)
  // Accept only the source metadata row, never arbitrary dates in prose/letters.
  const date = opening.match(
    /\bDate:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+Sex:\s*\S+(?:\s+Age:\s*.*?)?\s+ReadingID:\s*\d+\b/,
  )
  const qualified = /\bapproximat(?:e|ed|ely|ion)\b|\bexact date[^\.\]]*unknown\b/i.test(opening)
  const readingType = detectReadingType(opening)
  const contextParts = []
  if (date) contextParts.push(`${date[1]}${qualified ? " (approximate)" : ""}`)
  if (readingType) contextParts.push(readingType)
  const context = contextParts.join(" · ")
  let transcript = ""
  if (first) {
    transcript = reading
      .slice(first.index + first[0].length)
      .split(/\s+2\.\s+/)[0]
      .trim()
  } else if (speaker) {
    transcript = reading.slice(speaker.index).trim()
  }
  if (transcript) {
    const prefix = context ? `${context} · ` : ""
    const label = prefix.length + "Transcript: ".length + 20 < limit ? "Transcript: " : ""
    return compact(prefix + label + transcript, limit)
  }
  // Missing transcript: avoid mislabelling a header as a transcript.
  return compact(context || reading, limit)
}

/** Searchable title: exact reading numbers rank first via FlexSearch title weight. */
export function searchTitle(slug, item) {
  const raw = typeof item.title === "string" ? item.title.trim() : ""
  if (!slug.startsWith("readings/")) return raw
  const id = slug.slice("readings/".length)
  if (!id) return raw || "Reading"
  // Prefer "Reading 1527-2" so number queries still hit the title field hard.
  if (/^reading\s+/i.test(raw)) return raw
  if (raw === id || !raw) return `Reading ${id}`
  if (raw.includes(id)) return raw.startsWith("Reading") ? raw : `Reading ${raw}`
  return `Reading ${id}`
}

/** Prefix content with ids so bare case numbers (294) and exact ids match snippets. */
export function searchContent(slug, item, excerptLimit = 180) {
  const excerpt = searchExcerpt(slug, item, excerptLimit)
  if (!slug.startsWith("readings/")) return excerpt
  const id = slug.slice("readings/".length)
  const caseId = id.match(/^(.+)-\d+$/)?.[1]
  const tokens = [...new Set([id, caseId].filter(Boolean))]
  const prefix = tokens.join(" ")
  if (!prefix) return excerpt
  // Ids lead for ranking; SOURCE date/type/transcript remain in the visible snippet.
  // Allow a small budget over excerptLimit so the prefix is never truncated away.
  return compact(`${prefix} · ${excerpt}`, excerptLimit + prefix.length + 3)
}
