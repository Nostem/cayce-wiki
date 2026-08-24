import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import { h } from "preact"

export type BrowseLink = {
  label: string
  href: string
}

export const browseLinks: BrowseLink[] = [
  { label: "Home", href: "/" },
  { label: "All readings", href: "/readings" },
  { label: "Entities & concepts", href: "/entities" },
  { label: "Reading series", href: "/series" },
]

export const conceptLinks: BrowseLink[] = [
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

const list = (links: BrowseLink[], className: string) =>
  h(
    "ul",
    { class: className },
    links.map(({ label, href }) => h("li", null, h("a", { href, class: "internal" }, label))),
  )

export const BrowseSidebar: QuartzComponentConstructor = () => {
  const Component: QuartzComponent = ({ displayClass }: QuartzComponentProps) =>
    h(
      "nav",
      {
        class: [displayClass, "browse-sidebar"].filter(Boolean).join(" "),
        "aria-label": "Browse the Cayce wiki",
      },
      h("h2", null, "Browse"),
      list(browseLinks, "browse-sections"),
      h(
        "details",
        { open: true },
        h("summary", null, "Key concepts"),
        list(conceptLinks, "browse-concepts"),
      ),
    )

  Component.css = `
.browse-sidebar { margin-top: 1.25rem; }
.browse-sidebar h2 { margin: 0 0 0.5rem; font-size: 1rem; color: var(--dark); }
.browse-sidebar ul { list-style: none; margin: 0; padding: 0; }
.browse-sidebar li { margin: 0; }
.browse-sidebar a { display: block; padding: 0.22rem 0; color: var(--darkgray); font-size: 0.92rem; line-height: 1.35; text-decoration: none; }
.browse-sidebar a:hover { color: var(--secondary); }
.browse-sidebar .browse-sections { padding-bottom: 0.65rem; border-bottom: 1px solid var(--lightgray); }
.browse-sidebar details { margin-top: 0.65rem; }
.browse-sidebar summary { color: var(--dark); font-size: 0.88rem; font-weight: 600; cursor: pointer; user-select: none; }
.browse-sidebar .browse-concepts { margin-top: 0.35rem; padding-left: 0.85rem; border-left: 1px solid var(--lightgray); }
`

  return Component
}
