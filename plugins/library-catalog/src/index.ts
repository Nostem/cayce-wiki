import type { QuartzPageTypePlugin } from "../../../quartz/plugins/types"
import type { TopicGroupDefinition } from "../../../quartz/components/library/topics"
import { catalogPages } from "./catalog-state"
import { createCatalogBody } from "./catalog-body"
import { generateCatalogPages } from "./catalog-generate"

/** Owns folder/tag catalogs and entity/series bodies; disable packaged folder/tag generators. */
export const LibraryCatalog: QuartzPageTypePlugin<{
  verifyCorpus?: boolean
  topicGroups?: TopicGroupDefinition[]
}> = (opts) => {
  const Body = createCatalogBody()
  return {
    name: "LibraryCatalog",
    priority: 100,
    layout: "catalog",
    body: () => Body,
    match: ({ slug }) => catalogPages.has(slug.replace(/\/index$/, "")),
    generate({ content }) {
      return generateCatalogPages(content as any, opts)
    },
  }
}
export default LibraryCatalog
