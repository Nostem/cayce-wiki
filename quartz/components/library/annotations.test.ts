import test from "node:test"
import assert from "node:assert/strict"
import type { Element, Root } from "hast"
import { annotationTree, attachAnnotationControl } from "./annotations"
import { readerTree, sourceText } from "./reading"
const text = (value: string): any => ({ type: "text", value })
const el = (tagName: string, children: any[], properties = {}): Element => ({
  type: "element",
  tagName,
  properties,
  children,
})
const link = (label: string, href = "../entities/Virgin-Mary") => el("a", [text(label)], { href })
const root = (...children: any[]): Root => ({ type: "root", children })
for (const href of ["../entities/virgin-mary", "../virgin-mary", "../entities/Virgin-Mary"])
  test(`rendered Mary target ${href} is suppressed only in the full name`, () => {
    const tree = root(
      el("p", [link("Mary", href), text(" C. Clendenin; "), link("Virgin Mary", href)]),
    )
    const result = annotationTree(tree, "1527-2") as Root
    const p = result.children[0] as Element
    assert.equal((p.children[0] as Element).tagName, "span")
    assert.equal((p.children[2] as Element).tagName, "a")
    assert.equal(sourceText(result), sourceText(tree))
  })
for (const id of ["1527-1", "1527-2", "1527-3"])
  test(`${id}: precise mislink removal, words, punctuation, Q&A and immutability`, () => {
    const qa = el(
      "p",
      [
        text("13. (Q) Why? (A) "),
        link("Mary"),
        text(" C. Clendenin; "),
        link("Virgin Mary"),
        text("."),
        link("13", "#q13"),
      ],
      { id: "q13" },
    )
    const tree = root(qa)
    const before = JSON.stringify(tree)
    const result = annotationTree(tree, id) as Root
    assert.equal(sourceText(result), sourceText(tree))
    assert.equal(JSON.stringify(tree), before)
    const p = result.children[0] as Element
    assert.equal((p.children[1] as Element).tagName, "span")
    assert.equal(
      (p.children[1] as Element).properties["data-suppressed-association"],
      "known-mislink",
    )
    assert.equal((p.children[3] as Element).tagName, "a")
    assert.deepEqual(p.children[5], qa.children[5])
    assert.equal(p.properties.id, "q13")
    assert.deepEqual(annotationTree(result, id), result)
  })
test("given-name mislinks are removed for contemporary people across readings", () => {
  const cases: [string, any[]][] = [
    ["../entities/virgin-mary", [text("through Dr. "), link("Mary"), text(" Miller, Associate")]],
    [
      "../entities/king-david",
      [text("request made by Mr. "), link("David", "../entities/king-david"), text(" E. Kahn.")],
    ],
    [
      "../entities/john-apostle",
      [text("Dr. T. ["), link("John", "../entities/john-apostle"), text(" R. Thompson]")],
    ],
    [
      "../entities/virgin-mary",
      [text("then to William & "), link("Mary"), text(" at Williamsburg")],
    ],
    ["../entities/virgin-mary", [text("Steno. "), link("Mary"), text(" Wirsing and Harmon Bro.")]],
    [
      "../entities/king-david",
      [text("CARE "), link("DAVID", "../entities/king-david"), text(" E KAHN 44 WEST")],
    ],
  ]
  for (const [, children] of cases) {
    const tree = root(el("p", children))
    const result = annotationTree(tree, "1-1") as Root
    const anchor = (result.children[0] as Element).children[1] as Element
    assert.equal(anchor.tagName, "span", sourceText(tree))
    assert.equal(sourceText(result), sourceText(tree))
  }
})
test("biblical and ambiguous uses of the same names keep their links", () => {
  const cases: any[][] = [
    [text("Joseph, the husband of "), link("Mary"), text(", the mother of the Lord")],
    [text("the reuniting of Martha, Lazarus and "), link("Mary"), text("; while")],
    [text("(Q) How did "), link("Mary"), text(" and Joseph first come")],
    [text("In the beginning "), link("Mary"), text(" WAS the twin-soul")],
    [text("the other "), link("Mary"), text(" [i.e., other than")],
    [text("Among them was "), link("Mary"), text(", the beloved")],
    [text("in "), link("David", "../entities/king-david"), text(" The king")],
  ]
  for (const children of cases) {
    const tree = root(el("p", children))
    const result = annotationTree(tree, "5749-7") as Root
    const anchor = (result.children[0] as Element).children[1] as Element
    assert.equal(anchor.tagName, "a", sourceText(tree))
    assert.equal(anchor.properties["data-generated-annotation"], "true")
  }
})
test("index entry becomes plain text only when every transcript link was a mislink", () => {
  const mentioned = () => [
    el("h2", [text("Mentioned Entities")], { id: "mentioned-entities" }),
    el("p", [link("Virgin Mary"), text(", "), link("Atlantis", "../entities/atlantis")]),
  ]
  const onlyMislinks = root(
    el("p", [text("copy to Miss "), link("Mary"), text(" C. Clendenin")]),
    ...mentioned(),
  )
  const result = annotationTree(onlyMislinks, "1527-2") as Root
  const list = result.children[2] as Element
  assert.equal((list.children[0] as Element).tagName, "span")
  assert.equal((list.children[0] as Element).properties["data-suppressed-association"], "name-only")
  assert.equal((list.children[2] as Element).tagName, "a")
  assert.equal(sourceText(result), sourceText(onlyMislinks))
  assert.deepEqual(annotationTree(result, "1527-2"), result)
  const mixed = root(
    el("p", [text("copy to Miss "), link("Mary"), text(" C. Clendenin")]),
    el("p", [text("the mother of Jesus, "), link("Mary"), text(", was")]),
    ...mentioned(),
  )
  const kept = annotationTree(mixed, "1527-2") as Root
  assert.equal(((kept.children[3] as Element).children[0] as Element).tagName, "a")
})
test("generated sections close without swallowing Reports or Background; integrated and idempotent", () => {
  const tree = root(
    el("h2", [text("Index (LLM-extracted)")], { id: "index" }),
    el("p", [text("generated")]),
    el("h2", [text("Linked Entities")]),
    el("p", [link("Mary")]),
    el("h2", [text("Reports")], { id: "reports" }),
    el("p", [text("archival report")]),
    el("h2", [text("Background")]),
  )
  const result = readerTree(tree, { reading: "1527-2" }, "readings/1527-2") as Root
  const details = result.children.filter(
    (n) => n.type === "element" && n.tagName === "details",
  ) as Element[]
  assert.equal(details.length, 2)
  assert.ok(details.every((d) => !d.properties.open))
  const withoutLabels = (n: any): string =>
    n.tagName === "summary"
      ? ""
      : n.type === "text"
        ? n.value
        : (n.children ?? []).map(withoutLabels).join("")
  assert.equal(withoutLabels(result), sourceText(tree))
  assert.ok(result.children.some((n) => n.type === "element" && n.properties.id === "reports"))
  assert.deepEqual(readerTree(result, { reading: "1527-2" }, "readings/1527-2"), result)
})
test("control removes/restores only annotation hrefs and SPA cleanup removes listener", () => {
  class Fake extends EventTarget {
    attrs = new Map<string, string>()
    textContent = ""
    setAttribute(k: string, v: string) {
      this.attrs.set(k, v)
    }
    getAttribute(k: string) {
      return this.attrs.get(k) ?? null
    }
    removeAttribute(k: string) {
      this.attrs.delete(k)
    }
  }
  const button = new Fake(),
    anchor = new Fake(),
    status = new Fake()
  anchor.setAttribute("href", "../entities/Virgin-Mary")
  const scope = {
    querySelector: (s: string) => (s === "[data-annotation-toggle]" ? button : status),
    querySelectorAll: () => [anchor],
  }
  const cleanup = attachAnnotationControl(scope as any)
  button.dispatchEvent(new Event("click"))
  assert.equal(anchor.getAttribute("href"), null)
  assert.equal(button.getAttribute("aria-pressed"), "true")
  assert.match(status.textContent, /plain text/)
  button.dispatchEvent(new Event("click"))
  assert.equal(anchor.getAttribute("href"), "../entities/Virgin-Mary")
  cleanup()
  button.dispatchEvent(new Event("click"))
  assert.equal(anchor.getAttribute("href"), "../entities/Virgin-Mary")
})
