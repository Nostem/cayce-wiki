import type { CatalogRecord, CatalogSort } from "../../../quartz/components/library/catalog"
import type { TopicGroup } from "../../../quartz/components/library/topics"

export interface Collection {
  base: string
  title: string
  rows: CatalogRecord[]
  description: string
  topic?: TopicGroup
  combined?: TopicGroup
  filters?: { label: string; base: string }[]
  preferredFilters?: { label: string; base: string }[]
}
export interface Page {
  collection: Collection
  sort: CatalogSort
  number: number
  preferredSort: CatalogSort
}
export const PREFERRED_ENTITY_TYPES = ["concept", "place", "remedy"]
export const catalogPages = new Map<string, Page>()

export function outputSlug(slug: string) {
  if (slug.endsWith("/index")) return slug
  return ["readings", "entities", "series", "tags"].includes(slug) ||
    (/^tags\//.test(slug) &&
      !/\/page\/\d+$/.test(slug) &&
      !/\/by-date\//.test(slug) &&
      !/\/by-name\//.test(slug) &&
      !/\/by-count\//.test(slug))
    ? `${slug}/index`
    : slug
}
