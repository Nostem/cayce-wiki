/**
 * Given-name mislink audit.
 *
 * The corpus's surface-form linker attached bare given names to biblical figures
 * ("Mary" → Virgin Mary, "John" → John (Apostle), "David" → King David) even when the
 * source plainly names a different, contemporary person: "Dr. [[Virgin Mary|Mary]] Miller",
 * "Mr. [[King David|David]] E. Kahn", "Dr. T. [[[John (Apostle)|John]] R. Thompson]",
 * "William & [[Virgin Mary|Mary]] College".
 *
 * Rules are deliberately narrow and fail safe:
 * - only a link whose visible text is exactly the bare given name is considered;
 * - it is flagged only with person-name context: an honorific or initial immediately
 *   before it, or a middle initial / capitalized surname immediately after it;
 * - flagging only removes a link or demotes a "Strong match" label. It never adds an
 *   association, never changes source words, and never edits the vault.
 * Anything ambiguous ("Martha, Mary and Lazarus", "the other Mary") is left untouched.
 */

/** Entity route keys (see entityKey) → bare given names the linker attached to them. */
export const GIVEN_NAME_TARGETS: Readonly<Record<string, readonly string[]>> = {
  "virgin-mary": ["Mary"],
  "john-apostle": ["John"],
  "king-david": ["David"],
  "zacharias-and-elizabeth": ["Elizabeth"],
  "peter-apostle": ["Peter"],
  "paul-apostle": ["Paul"],
  "joseph-husband-of-mary": ["Joseph"],
  "adam-and-eve": ["Adam", "Eve"],
}

export type MislinkReason = "honorific" | "initial" | "surname"

/** Words that can follow a biblical given name without making it a different person. */
const STOP = new Set(
  `And But Or Nor For So Yet The A An In On At As To Of By With From Into Unto Upon Then Than
  This That These Those There Here He She It We They You I Me My His Her Its Our Their Your Who
  Whom Whose Which What When Where Why How Was Were Is Are Am Be Been Being Had Has Have Do Did
  Does Will Would Shall Should May Might Must Can Could Yes No Not Q EC GD HLC Ye Thee Thou Thy
  Thine Him Himself Herself Lord God Christ Jesus Master Mother Father Son Holy Virgin Martha
  Lazarus Joseph Josie Elizabeth Zebedee Zacharias Anna Ann Peter Paul John James Andrew Mark
  Luke Matthew Philip Mary Salome Eve Adam Abel Cain Seth Saul Solomon Bathsheba Goliath Jonathan
  Absalom Samuel Jesse Baptist Beloved Apostle Disciple Revelator Gospel Lamb Nazarene Galilee
  Bethany Bethlehem Nazareth Jerusalem Egypt Judea Magdala January February March April June July
  August September October November December Monday Tuesday Wednesday Thursday Friday Saturday
  Sunday`
    .split(/\s+/)
    .filter(Boolean),
)
/** Honorifics / "William & Mary" / a preceding initial ("S. David", "Dr. T. [John"). */
const HONORIFIC_BEFORE =
  /(?:\b(?:Dr|Mr|Mrs|DR|MR|MRS)\.?|\b(?:Ms|Prof|Rev)\.|\b(?:Miss|MISS)|\bWilliam\s+(?:&|and))\s*\[?\s*$/
const INITIAL_BEFORE = /(?:^|[\s(\[])[A-Z]\.\s*\[?\s*$/
/** Middle initial ("Mary C. Clendenin", "DAVID E KAHN") or a capitalized surname. */
const AFTER =
  /^\]?[ \t]*(?:\r?\n[ \t>]*)?(?:([A-Z])\.(?=\s)|([B-HJ-Z])(?=[ \t]+[A-Z])|([A-Z][a-z]+|[A-Z]{2,})\b)/

/** Normalize an entity label, wikilink target or href segment to a route-like key. */
export function entityKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(?:html|md)$/, "")
    .replace(/[()]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
}

/** Key for an internal href such as ../entities/virgin-mary; undefined for external links. */
export function hrefEntityKey(href: unknown): string | undefined {
  if (typeof href !== "string" || /^(?:[a-z]+:|\/\/|#)/i.test(href)) return
  try {
    const path = decodeURIComponent(href).split(/[?#]/)[0]
    const segment = path.split("/").filter(Boolean).pop()
    return segment ? entityKey(segment) : undefined
  } catch {
    return
  }
}

export function isGivenNameTarget(key: string | undefined): key is string {
  return !!key && Object.prototype.hasOwnProperty.call(GIVEN_NAME_TARGETS, key)
}

/**
 * Classify one link occurrence. `before` / `after` are the visible words immediately around
 * the link (wikilinks already reduced to their display text).
 */
export function givenNameMislink(
  key: string | undefined,
  text: string,
  before: string,
  after: string,
): MislinkReason | undefined {
  if (!isGivenNameTarget(key)) return
  const visible = text.trim()
  const names = GIVEN_NAME_TARGETS[key]
  if (!names.some((name) => name.toLowerCase() === visible.toLowerCase())) return
  if (HONORIFIC_BEFORE.test(before) || INITIAL_BEFORE.test(before)) return "honorific"
  const match = AFTER.exec(after)
  if (!match) return
  if (match[1] || match[2]) return "initial"
  const word = match[3]
  const allCaps = /^[A-Z]{2,}$/.test(word)
  // An all-caps surname only counts in all-caps (telegram) text: "MARY MILLER", not "Mary WAS".
  if (allCaps && visible !== visible.toUpperCase()) return
  const normalized = word.charAt(0) + word.slice(1).toLowerCase()
  return STOP.has(normalized) || STOP.has(word) ? undefined : "surname"
}

const WIKILINK = /\[\[([^[\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
const GENERATED_SECTION =
  /^#{2,3}\s+(?:Index \(LLM-extracted\)|Linked Entities|Mentioned Entities)\s*$/m
const display = (value: string) =>
  value.replace(WIKILINK, (_match, target: string, alias?: string) => alias ?? target)

export interface GivenNameAudit {
  flagged: number
  kept: number
}

/**
 * Audit a reading's Markdown source (before generated index sections) for links to
 * given-name targets. Only targets in GIVEN_NAME_TARGETS are reported.
 */
export function auditGivenNameLinks(source: string): Map<string, GivenNameAudit> {
  const audit = new Map<string, GivenNameAudit>()
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)
  const start = frontmatter ? frontmatter[0].length : 0
  const rest = source.slice(start)
  const cut = rest.search(GENERATED_SECTION)
  const body = cut >= 0 ? rest.slice(0, cut) : rest
  for (const match of body.matchAll(WIKILINK)) {
    const key = entityKey(match[1])
    if (!isGivenNameTarget(key)) continue
    const index = match.index ?? 0
    const end = index + match[0].length
    const text = match[2] ?? match[1]
    const before = display(body.slice(Math.max(0, index - 80), index))
    const after = display(body.slice(end, end + 80))
    const row = audit.get(key) ?? { flagged: 0, kept: 0 }
    if (givenNameMislink(key, text, before, after)) row.flagged++
    else row.kept++
    audit.set(key, row)
  }
  return audit
}

/** Targets whose every in-text link in this reading is a flagged given-name mislink. */
export function nameOnlyTargets(source: string): Set<string> {
  const targets = new Set<string>()
  for (const [key, { flagged, kept }] of auditGivenNameLinks(source))
    if (flagged > 0 && kept === 0) targets.add(key)
  return targets
}
