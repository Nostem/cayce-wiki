import type { Element, Node, Root, RootContent, Text } from "hast"

const words = (node: Node): string =>
  node.type === "text"
    ? (node as Text).value
    : "children" in node
      ? (node.children as Node[]).map(words).join("")
      : ""
const generatedHeading = (node: RootContent) =>
  node.type === "element" &&
  /^h[2-3]$/.test(node.tagName) &&
  ["Index (LLM-extracted)", "Linked Entities"].includes(words(node).trim())
function entityTarget(href: unknown): string | undefined {
  if (typeof href !== "string" || /^(?:[a-z]+:|\/\/|#)/i.test(href)) return
  try {
    const match = decodeURIComponent(href).match(/(?:^|\/)entities\/([^/#?]+)(?:\.html)?$/)
    return match?.[1].replace(/\.html$/, "")
  } catch {
    return
  }
}

/** Render-only, narrowly scoped correction; original nodes and words remain intact. */
export function annotationTree(tree: Node, reading: string): Node {
  if (tree.type !== "root") return tree
  function visit(node: Node): Node {
    if (!("children" in node)) return node
    const original = node.children as Node[]
    const children = original.map((child, index) => {
      if (child.type === "element" && (child as Element).tagName === "a") {
        const anchor = child as Element
        const target = entityTarget(anchor.properties.href)
        // Match the complete local name, not Mary generally or other readings.
        const suffix = original
          .slice(index + 1)
          .map(words)
          .join("")
        const href = String(anchor.properties.href ?? "")
        const virginMaryTarget =
          /^(?:(?:\.\.\/)+|\/?entities\/)(?:entities\/)?virgin[- ]mary(?:\.html)?$/i.test(href)
        if (
          ["1527-1", "1527-2"].includes(reading) &&
          virginMaryTarget &&
          words(anchor) === "Mary" &&
          /^ C\. Clendenin(?:\b|$)/.test(suffix)
        ) {
          return {
            type: "element",
            tagName: "span",
            properties: { "data-suppressed-association": "known-mislink" },
            children: anchor.children,
          } as Element
        }
        if (target)
          return {
            ...anchor,
            properties: { ...anchor.properties, "data-generated-annotation": "true" },
          }
      }
      return visit(child)
    })
    return { ...node, children } as Node
  }
  const root = visit(tree) as Root
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
