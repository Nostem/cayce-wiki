import {
  slugifyFilePath as baseSlugify,
  type FilePath,
  type FullSlug,
} from "@quartz-community/utils"
import mapping from "./sourceRouteCollisions.json"

export const sourceRouteCollisions = mapping.collisions
const overrides = new Map(mapping.collisions.map((row) => [row.source, row.route]))
/** Exact content-relative source identity BEFORE Quartz's lossy normalization. */
export function sourceRoute(source: string, excludeExt?: boolean): FullSlug {
  const key = source.replace(/^\.\//, "").replace(/^\//, "")
  return (overrides.get(key) ?? baseSlugify(source as FilePath, excludeExt)) as FullSlug
}
export function sourceRouteMap(sources: readonly string[]): Map<string, FullSlug> {
  const routes = new Map<string, FullSlug>()
  const outputs = new Map<string, string>()
  for (const source of sources) {
    const route = sourceRoute(source)
    const prior = outputs.get(route)
    if (prior !== undefined)
      throw new Error(`Duplicate source output ${route}: ${prior} and ${source}`)
    outputs.set(route, source)
    routes.set(source, route)
  }
  return routes
}

/** Resolve exact parsed source targets before packaged OFM loses source identity.
 * Leaves literal text, code, frontmatter, aliases and headings unchanged. */
interface WikilinkTree {
  type: string
  path?: string
  alias?: string
  heading?: string
  children?: WikilinkTree[]
}
export function rewriteSourceWikilinkAst(tree: WikilinkTree): void {
  if (tree.type === "wikilink" && tree.path) {
    const source = tree.path.trim()
    const route = exactTargets.get(source.replace(/^\.\//, ""))
    if (route) {
      if (!tree.alias?.trim())
        tree.alias = source + (tree.heading?.trim() ? ` > ${tree.heading.trim()}` : "")
      tree.path = route
    }
  }
  for (const child of tree.children ?? []) rewriteSourceWikilinkAst(child)
}

const exactTargets = new Map<string, string>()
for (const row of mapping.collisions) {
  for (const source of [row.source, row.winner]) {
    const target = source.replace(/\.md$/, "")
    const route = source === row.source ? row.route : row.canonical
    exactTargets.set(target, route)
    exactTargets.set(source, route)
    exactTargets.set(target.slice("entities/".length), route)
    exactTargets.set(source.slice("entities/".length), route)
  }
}
