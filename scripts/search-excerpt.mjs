// Operates only on the full text already supplied by Quartz's content index.
// Keep all context in `content`: no extra client field or corpus/file lookup.
function compact(text, limit) {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= limit) return flat
  if (limit <= 1) return limit === 1 ? "…" : ""
  let cut = flat.slice(0, limit - 1)
  const space = cut.lastIndexOf(" ")
  if (space > limit * 0.6) cut = cut.slice(0, space)
  return cut + "…"
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
  const qualified = /\bapproximat(?:e|ed|ely|ion)\b|\bexact date[^.\]]*unknown\b/i.test(opening)
  const context = date ? `${date[1]}${qualified ? " (approximate)" : ""}` : ""
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
