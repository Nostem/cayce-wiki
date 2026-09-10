/** Presentation only: keep the historical number separate from source identity. */
export function readingLabel(reading: string, slug: string): string {
  const sourceRecord = slug.startsWith("readings/") ? slug.slice("readings/".length) : ""
  return /^[^/]+_id\d+$/.test(sourceRecord) ? `${reading} (source record ${sourceRecord})` : reading
}
