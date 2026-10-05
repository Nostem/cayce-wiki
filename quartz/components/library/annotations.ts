import type { Element, Node, Root, RootContent, Text } from "hast"
import { givenNameMislink, hrefEntityKey, isGivenNameTarget, type GivenNameAudit } from "./mislinks"

const words = (node: Node): string =>
  node.type === "text"
    ? (node as Text).value
    : node.type === "element" && (node as Element).tagName === "br"
      ? "\n"
      : "children" in node
        ? (node.children as Node[]).map(words).join("")
        : ""
const GENERATED_HEADINGS = ["Index (LLM-extracted)", "Linked Entities"]
/** Generated index sections (collapsed) plus the generated "Mentioned Entities" list. */
const INDEX_HEADINGS = [...GENERATED_HEADINGS, "Mentioned Entities"]
const headingText = (node: RootContent) =>
  node.type === "element" && /^h[2-3]$/.test(node.tagName) ? words(node).trim() : undefined
const generatedHeading = (node: RootContent) => GENERATED_HEADINGS.includes(headingText(node) ?? "")
function entityTarget(href: unknown): string | undefined {
  if (typeof href !== "string" || /^(?:[a-z]+:|\/\/|#)/i.test(href)) return
  try {
    const match = decodeURIComponent(href).match(/(?:^|\/)entities\/([^/#?]+)(?:\.html)?$/)
    return match?.[1].replace(/\.html$/, "")
  } catch {
    return
  }
}
/** Classify an anchor among its siblings; undefined when it is not a given-name mislink. */
function mislinkAt(siblings: Node[], index: number) {
  const anchor = siblings[index] as Element
  const key = hrefEntityKey(anchor.properties.href)
  if (!isGivenNameTarget(key)) return { key: undefined, reason: undefined }
  const before = siblings.slice(0, index).map(words).join("")
  const after = siblings
    .slice(index + 1)
    .map(words)
    .join("")
  return { key, reason: givenNameMislink(key, words(anchor), before, after) }
}
const suppressed = (anchor: Element, reason: string): Element => ({
  type: "element",
  tagName: "span",
  properties: {
    "data-suppressed-association": reason,
    title: "Generated link removed: here the name refers to someone or something else.",
  },
  children: anchor.children,
})

/** Count flagged vs kept given-name target links in the transcript (non-index) sections. */
function auditTree(children: RootContent[]): Map<string, GivenNameAudit> {
  const audit = new Map<string, GivenNameAudit>()
  function visit(node: Node) {
    if (!("children" in node)) return
    const siblings = node.children as Node[]
    siblings.forEach((child, index) => {
      if (child.type === "element" && (child as Element).tagName === "a") {
        const { key, reason } = mislinkAt(siblings, index)
        if (key) {
          const row = audit.get(key) ?? { flagged: 0, kept: 0 }
          if (reason) row.flagged++
          else row.kept++
          audit.set(key, row)
        }
        return
      }
      visit(child)
    })
  }
  let inIndex = false
  for (const node of children) {
    const heading = headingText(node)
    if (heading !== undefined) inIndex = INDEX_HEADINGS.includes(heading)
    if (!inIndex) visit(node)
  }
  return audit
}

/**
 * Render-only, narrowly scoped correction; original nodes and words remain intact.
 * Given-name mislinks ("Dr. Mary Miller" → Virgin Mary) become plain text. When every
 * transcript link to such a target was a mislink, the generated index entry for it is
 * also shown as plain text so the page does not assert an unsupported association.
 */
export function annotationTree(tree: Node, _reading: string): Node {
  if (tree.type !== "root") return tree
  const audit = auditTree((tree as Root).children)
  const nameOnly = new Set(
    [...audit].filter(([, row]) => row.flagged > 0 && row.kept === 0).map(([key]) => key),
  )
  function visit(node: Node, inIndex: boolean): Node {
    if (!("children" in node)) return node
    const original = node.children as Node[]
    const children = original.map((child, index) => {
      if (child.type === "element" && (child as Element).tagName === "a") {
        const anchor = child as Element
        const { key, reason } = mislinkAt(original, index)
        if (reason) return suppressed(anchor, "known-mislink")
        if (inIndex && key && nameOnly.has(key)) return suppressed(anchor, "name-only")
        if (entityTarget(anchor.properties.href))
          return {
            ...anchor,
            properties: { ...anchor.properties, "data-generated-annotation": "true" },
          }
      }
      return visit(child, inIndex)
    })
    return { ...node, children } as Node
  }
  let inIndex = false
  const root = {
    ...(tree as Root),
    children: (tree as Root).children.map((node) => {
      const heading = headingText(node)
      if (heading !== undefined) inIndex = INDEX_HEADINGS.includes(heading)
      return visit(node, inIndex) as RootContent
    }),
  } as Root
  const children: RootContent[] = []
  for (let i = 0; i < root.children.length; i++) {
    const node = root.children[i]
    if (!generatedHeading(node)) {
      children.push(node)
      continue
    }
    const level = Number((node as Element).tagName[1])
    const section: RootContent[] = [node]
    while (i + 1 < root.children.length) {
      const next = root.children[i + 1]
      if (
        next.type === "element" &&
        /^h[1-6]$/.test(next.tagName) &&
        (Number(next.tagName[1]) <= level || ["Reports", "Background"].includes(words(next).trim()))
      )
        break
      section.push(next)
      i++
    }
    children.push({
      type: "element",
      tagName: "details",
      properties: { className: ["generated-research-index"] },
      children: [
        {
          type: "element",
          tagName: "summary",
          properties: { "data-reader-ui": "true" },
          children: [{ type: "text", value: "Generated research index" }],
        },
        ...section,
      ],
    } as Element)
  }
  return { ...root, children } as Root
}

/** Scope to the current reading's frame; never touch navigation or citations. */
export function attachAnnotationControl(
  scope: Pick<ParentNode, "querySelector" | "querySelectorAll">,
): () => void {
  const button = scope.querySelector<HTMLButtonElement>("[data-annotation-toggle]")
  const status = scope.querySelector<HTMLElement>("[data-annotation-status]")
  if (!button) return () => {}
  const links = Array.from(
    scope.querySelectorAll<HTMLAnchorElement>("a[data-generated-annotation]"),
  )
  for (const link of links) {
    const href = link.getAttribute("href")
    if (href !== null) link.setAttribute("data-annotation-href", href)
  }
  let plain = false
  const update = () => {
    button.setAttribute("aria-pressed", String(plain))
    for (const link of links) {
      const href = link.getAttribute("data-annotation-href")
      if (plain) {
        link.removeAttribute("href")
        link.setAttribute("data-annotation-plain", "true")
      } else {
        if (href !== null && href !== undefined) link.setAttribute("href", href)
        link.removeAttribute("data-annotation-plain")
      }
    }
    if (status)
      status.textContent = plain
        ? "Generated topic links shown as plain text. Original words are unchanged."
        : "Generated topic links enabled; associations may be mistaken."
  }
  const toggle = () => {
    plain = !plain
    update()
  }
  update()
  button.addEventListener("click", toggle)
  return () => {
    button.removeEventListener("click", toggle)
    plain = false
    update()
  }
}
