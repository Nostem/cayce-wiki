import test from "node:test"
import assert from "node:assert/strict"
import { relatedReadingsFor, resetRelatedCache } from "./related"

test("related readings prefer multi-entity overlap and ignore single name-drops", () => {
  resetRelatedCache()
  const files = [
    {
      slug: "readings/1-1",
      frontmatter: { reading: "1-1", entities: ["Atlantis", "Meditation", "Castor Oil"] },
    },
    {
      slug: "readings/2-1",
      frontmatter: { reading: "2-1", entities: ["Atlantis", "Meditation", "Dreams"] },
    },
    {
      slug: "readings/3-1",
      frontmatter: { reading: "3-1", entities: ["Atlantis"] },
    },
    {
      slug: "readings/4-1",
      frontmatter: { reading: "4-1", entities: ["Meditation", "Castor Oil", "Healing"] },
    },
    { slug: "entities/Atlantis", frontmatter: { entity: "Atlantis" } },
  ]
  const related = relatedReadingsFor("1-1", files)
  assert.deepEqual(
    related.map((r) => r.id),
    ["2-1", "4-1"],
  )
  assert.ok(related[0].shared.includes("Atlantis"))
  assert.ok(related[0].shared.includes("Meditation"))
  assert.equal(related.every((r) => r.score >= 2), true)
})

test("empty when fewer than two shared topics", () => {
  resetRelatedCache()
  assert.deepEqual(
    relatedReadingsFor("1-1", [
      { slug: "readings/1-1", frontmatter: { reading: "1-1", entities: ["Atlantis"] } },
      { slug: "readings/2-1", frontmatter: { reading: "2-1", entities: ["Atlantis"] } },
    ]),
    [],
  )
})
