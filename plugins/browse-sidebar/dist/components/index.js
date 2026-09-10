// src/components/index.ts
import { h } from "preact"

// ../../quartz/components/library/annotations.ts
function attachAnnotationControl(scope) {
  const button = scope.querySelector("[data-annotation-toggle]")
  const status = scope.querySelector("[data-annotation-status]")
  if (!button) return () => {}
  const links = Array.from(scope.querySelectorAll("a[data-generated-annotation]"))
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
        if (href !== null && href !== void 0) link.setAttribute("href", href)
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

// src/components/index.ts
var browseLinks = [
  { label: "Home", href: "/" },
  { label: "All readings", href: "/readings" },
  { label: "Entities & concepts", href: "/entities" },
  { label: "Reading series", href: "/series" },
]
var conceptLinks = [
  { label: "Atlantis", href: "/entities/atlantis" },
  { label: "Soul", href: "/entities/soul" },
  { label: "Dreams", href: "/entities/dreams" },
  { label: "Healing", href: "/entities/healing" },
  { label: "Meditation", href: "/entities/meditation" },
  { label: "Prayer", href: "/entities/prayer" },
  { label: "Reincarnation", href: "/entities/reincarnation" },
  { label: "Astrology", href: "/entities/astrology" },
  { label: "Egypt", href: "/entities/egypt" },
  { label: "Jesus Christ", href: "/entities/jesus-christ" },
]
var list = (links, className, current) =>
  h(
    "ul",
    { class: className },
    links.map(({ label, href }) =>
      h(
        "li",
        null,
        h(
          "a",
          { href, class: "internal", "aria-current": href === current ? "page" : void 0 },
          label,
        ),
      ),
    ),
  )
var BrowseSidebar = () => {
  const Component = ({ displayClass, fileData }) => {
    const slug = String(fileData?.slug ?? "index")
    const section = slug.split("/")[0]
    const current =
      slug === "index"
        ? "/"
        : ["readings", "entities", "series"].includes(section)
          ? `/${section}`
          : ""
    const help = h(
      "a",
      { href: "/help", class: "browse-help internal" },
      "Reading & citation guide",
    )
    return h(
      "nav",
      {
        class: [displayClass, "browse-sidebar"].filter(Boolean).join(" "),
        "aria-label": "Browse the Cayce wiki",
      },
      h(
        "div",
        { class: "browse-desktop" },
        h("h2", null, "Browse"),
        list(browseLinks, "browse-sections", current),
        h(
          "details",
          null,
          h("summary", null, "Key concepts"),
          list(conceptLinks, "browse-concepts", current),
        ),
        help,
      ),
      h(
        "details",
        { class: "browse-mobile" },
        h("summary", null, "Browse library"),
        list(browseLinks, "browse-sections", current),
        help,
      ),
    )
  }
  Component.afterDOMLoaded = `
(() => {
  const attach = ${attachAnnotationControl.toString()};
  let cleanup = () => {};
  document.addEventListener("nav", () => {
    cleanup();
    const scope = document.querySelector(".reader-main");
    cleanup = scope ? attach(scope) : () => {};
    window.addCleanup(() => { cleanup(); cleanup = () => {}; });
  });
})();
`
  Component.css = `
.browse-sidebar { margin-top: 1.25rem; }
.browse-sidebar h2 { margin: 0 0 0.5rem; font-size: 1rem; color: var(--dark); }
.browse-sidebar ul { list-style: none; margin: 0; padding: 0; }
.browse-sidebar li { margin: 0; }
.browse-sidebar a { display: block; padding: 0.4rem 0.5rem; color: var(--darkgray); font-size: 0.95rem; line-height: 1.4; text-decoration: none; background: transparent; border-radius: 0.2rem; }
.browse-sidebar a:hover { color: var(--secondary); text-decoration: underline; }
.browse-sidebar a[aria-current="page"] { color: var(--dark); background: var(--highlight); font-weight: 650; }
.browse-sidebar .browse-sections { padding-bottom: 0.65rem; border-bottom: 1px solid var(--lightgray); }
.browse-sidebar details { margin-top: 0.65rem; }
.browse-sidebar summary { padding: 0.5rem; color: var(--dark); font-size: 0.95rem; font-weight: 600; cursor: pointer; }
.browse-sidebar .browse-concepts { margin-top: 0.35rem; padding-left: 0.5rem; }
.browse-sidebar .browse-help { margin-top: 1rem; font-size: 0.9rem; }
.browse-mobile { display: none; }
@media (max-width: 800px) {
  .browse-sidebar { flex-basis: 100%; width: 100%; margin: 0; }
  .browse-desktop { display: none; }
  .browse-mobile { display: block; }
  .browse-sidebar .browse-mobile { margin: 0; }
  .browse-mobile summary, .browse-mobile a { min-height: 44px; box-sizing: border-box; display: flex; align-items: center; }
  .browse-mobile summary { display: list-item; line-height: 28px; }
}
`
  return Component
}
export { BrowseSidebar, browseLinks, conceptLinks }
