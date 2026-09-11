import { sourceRoute } from "../../util/sourceRoutes"
import { compareCatalog, naturalCompare, type CatalogRecord } from "./catalog"

export interface TopicGroupDefinition {
  id: string
  label: string
  kind: "equivalent" | "umbrella"
  reason: string
  sources: string[]
}
export interface TopicGroup {
  definition: TopicGroupDefinition
  row: CatalogRecord
  sources: CatalogRecord[]
  readings: CatalogRecord[]
}
export function topicRoute(id: string): string {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new Error(`Invalid topic id: ${id}`)
  return `topics/${id}`
}
export function parseTopicManifest(value: unknown): TopicGroupDefinition[] {
  const manifest = value as { version?: unknown; groups?: unknown } | null
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.groups))
    throw new Error("Invalid topic manifest: expected version 1 and groups array")
  return manifest.groups
}
/** Pure derived model. Inputs are exact source identities and already verified memberships. */
export function buildTopicGroups(
  definitions: readonly TopicGroupDefinition[],
  entities: ReadonlyMap<string, CatalogRecord>,
  memberships: ReadonlyMap<string, readonly string[]>,
  readings: ReadonlyMap<string, CatalogRecord>,
  occupiedRoutes: ReadonlySet<string> = new Set(),
) {
  if (!Array.isArray(definitions)) throw new Error("Invalid topic groups")
  const bySourceRoute = new Map<string, TopicGroup>()
  const routes = new Set<string>()
  const groups: TopicGroup[] = []
  for (const definition of definitions) {
    if (!definition || typeof definition !== "object") throw new Error("Invalid topic group")
    const route = topicRoute(definition.id)
    if (routes.has(route) || occupiedRoutes.has(route) || occupiedRoutes.has(`${route}/index`))
      throw new Error(`Colliding topic route: ${route}`)
    routes.add(route)
    if (
      typeof definition.label !== "string" ||
      !definition.label.trim() ||
      typeof definition.reason !== "string" ||
      !definition.reason.trim() ||
      !["equivalent", "umbrella"].includes(definition.kind) ||
      !Array.isArray(definition.sources) ||
      definition.sources.length < 2
    )
      throw new Error(`Invalid topic definition: ${route}`)
    const ids = new Set<string>()
    const sources: CatalogRecord[] = []
    const owned = new Set<string>()
    for (const source of definition.sources) {
      if (typeof source !== "string" || !/^entities\/[^/\\\u0000-\u001f]+\.md$/.test(source))
        throw new Error(`Invalid topic source path: ${source}`)
      const record = entities.get(source)
      if (!record) throw new Error(`Unknown topic source: ${source}`)
      const resolved = sourceRoute(source)
      if (record.slug !== resolved || record.kind !== "entities")
        throw new Error(`Topic source route mismatch: ${source}`)
      if (owned.has(resolved) || bySourceRoute.has(resolved))
        throw new Error(`Multiply owned topic source: ${source}`)
      owned.add(resolved)
      const members = memberships.get(resolved)
      if (!members) throw new Error(`Missing verified membership: ${source}`)
      for (const id of members) {
        if (!readings.has(id)) throw new Error(`Missing topic reading: ${id}`)
        ids.add(id)
      }
      sources.push(record)
    }
    const group: TopicGroup = {
      definition,
      row: {
        slug: route,
        label: definition.label,
        kind: "topics",
        count: ids.size,
        context: `${sources.length} source terms · ${definition.kind === "umbrella" ? "Umbrella grouping" : "Equivalent-name grouping"}`,
      },
      sources: sources.sort(compareCatalog("id")),
      readings: [...ids].sort(naturalCompare).map((id) => readings.get(id)!),
    }
    for (const source of sources) bySourceRoute.set(source.slug, group)
    groups.push(group)
  }
  return {
    groups,
    bySourceRoute,
    project(rows: readonly CatalogRecord[]): CatalogRecord[] {
      return [
        ...new Map(
          rows.map((row) => {
            const projected = bySourceRoute.get(row.slug)?.row ?? row
            return [projected.slug, projected] as const
          }),
        ).values(),
      ]
    },
  }
}
