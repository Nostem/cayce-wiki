import type { Element, Node, Root, RootContent, Text } from "hast"
import { annotationTree } from "./annotations"
import { readingLabel } from "./identity"

export interface ReaderIdentity {
  isReading: boolean
  title: string
  reading?: string
  originalDate?: string
  synopsis?: string
  sections: { id: string; label: string }[]
}

export function sourceText(node: Node): string {
  if (node.type === "element" && (node as Element).properties["data-reader-ui"]) return ""
  if (node.type === "text") return (node as Text).value
  if ("children" in node) return (node.children as Node[]).map(sourceText).join("")
  return ""
}
const scalar = (value: unknown): string | undefined =>
  typeof value === "string" || typeof value === "number" ? String(value) : undefined

/** Derive only from this record. Never use modification dates or scan allFiles. */
export function readingIdentity(
  tree: Node,
  metadata: Record<string, unknown> = {},
  slug = "",
): ReaderIdentity {
  const children = tree.type === "root" ? (tree as Root).children : []
  const reading = scalar(metadata.reading)
  const isReading = slug.startsWith("readings/") && !!reading
  const heading = children.find((node) => node.type === "element" && node.tagName === "h1")
  const sections = children.flatMap((node) =>
    node.type === "element" && /^h[2-3]$/.test(node.tagName) && node.properties.id
      ? [{ id: String(node.properties.id), label: sourceText(node).trim() }]
      : [],
  )
  // The export's Date/Sex/Age/ReadingID preamble is source-backed. Do not guess
  // locale, convert ambiguous dates, or accept a date mentioned in correspondence.
  const textIndex = children.findIndex(
    (node) =>
      node.type === "element" && node.tagName === "h2" && sourceText(node).trim() === "Text",
  )
  const preamble =
    textIndex >= 0
      ? children.slice(textIndex + 1).find((node) => node.type === "element")
      : undefined
  const dateMatch =
    preamble &&
    sourceText(preamble).match(
      /^Date:\s*(.*?)\s+Sex:\s*.*?\s+(?:Age:\s*.*?\s+)?ReadingID:\s*\d+\s*$/,
    )
  const opening =
    textIndex >= 0
      ? children
          .slice(textIndex + 1)
          .filter((node) => node.type === "element")
          .slice(0, 2)
          .map(sourceText)
          .join(" ")
      : ""
  const uncertainDate = /exact date of reading is unknown|date is approximated/i.test(opening)
  const recordedDate = dateMatch?.[1]?.trim() || scalar(metadata.original_date)
  const originalDate =
    isReading && recordedDate
      ? `${recordedDate}${uncertainDate ? " (approximate; exact date unknown in source)" : ""}`
      : undefined
  return {
    isReading,
    reading,
    title: isReading
      ? `Reading ${readingLabel(reading!, slug)}`
      : (heading ? sourceText(heading).trim() : scalar(metadata.title)) || "Library",
    originalDate,
    synopsis: isReading ? scalar(metadata.summary) : undefined,
    sections,
  }
}

/** Copy-on-write presentation only: never mutate the archival tree or source file. */
export function readerTree(tree: Node, metadata: Record<string, unknown> = {}, slug = ""): Node {
  if (tree.type !== "root") return tree
  const root = tree as Root
  const identity = readingIdentity(tree, metadata, slug)
  const titleIndex = root.children.findIndex((n) => n.type === "element" && n.tagName === "h1")
  const rowIndex =
    titleIndex < 0
      ? -1
      : root.children.findIndex(
          (n, i) => i > titleIndex && !(n.type === "text" && !sourceText(n).trim()),
        )
  const generatedRow = `Reading ${identity.reading} · Series: ${scalar(metadata.series)} · Year: ${scalar(metadata.year)} · Sex: ${scalar(metadata.sex)}`
  const completeIdentityRow = [
    metadata.reading,
    metadata.series,
    metadata.year,
    metadata.sex,
  ].every((value) => scalar(value) !== undefined)
  const children = root.children.flatMap((node, index): RootContent[] => {
    // Remove only the exact export chrome between its archival title and Text.
    const betweenTitleAndText = index === rowIndex
    if (
      identity.isReading &&
      completeIdentityRow &&
      betweenTitleAndText &&
      node.type === "element" &&
      node.tagName === "p" &&
      sourceText(node).trim() === generatedRow
    )
      return []
    if (node.type !== "element" || node.tagName !== "h1") return [node]
    // A source heading remains a heading and retains its words and anchor.
    const copy: Element = {
      ...node,
      tagName: "h2",
      properties: {
        ...node.properties,
        className: [
          ...(Array.isArray(node.properties.className) ? node.properties.className : []),
          "archival-title",
        ],
      },
    }
    return [copy]
  })
  const presented = { ...root, children } as Root
  return identity.isReading ? annotationTree(presented, identity.reading!) : presented
}
