import test from "node:test"
import assert from "node:assert/strict"
import { buildTopicGroups, topicRoute } from "./topics"
import { sourceRoute } from "../../util/sourceRoutes"
import type { CatalogRecord } from "./catalog"
const definitions = [
  {
    id: "activity",
    label: "Activity",
    kind: "equivalent" as const,
    reason: "Number variants",
    sources: ["entities/activity.md", "entities/activities.md"],
  },
]
const entities = new Map(
  definitions[0].sources.map((source) => [
    source,
    { slug: sourceRoute(source), label: source.slice(9, -3), kind: "entities", count: 2 },
  ]),
)
const readings = new Map(
  ["1-1", "1-1_id99", "2-1"].map((id) => [
    id,
    { slug: `readings/${id}`, label: id, kind: "readings" } as CatalogRecord,
  ]),
)
const memberships = new Map([
  ["entities/activity", ["1-1", "1-1_id99"]],
  ["entities/activities", ["1-1", "2-1"]],
])
test("unions exact reading identities and projects every entity once", () => {
  const model = buildTopicGroups(definitions, entities, memberships, readings)
  assert.equal(model.groups[0].row.count, 3)
  assert.deepEqual(
    model.groups[0].readings.map((r) => r.slug),
    ["readings/1-1", "readings/1-1_id99", "readings/2-1"],
  )
  assert.equal(model.project([...entities.values()]).length, 1)
  assert.equal(model.bySourceRoute.get("entities/activity"), model.groups[0])
  assert.equal(entities.get("entities/activity.md")!.count, 2)
})
for (const id of ["", "../bad", "Activity", "a/b", "a%20b", "a--b"])
  test(`reject malformed group route ${id}`, () => assert.throws(() => topicRoute(id)))
for (const sources of [
  ["entities/activity.md"],
  ["entities/activity.md", "entities/missing.md"],
  ["entities/activity.md", "entities/activity.md"],
  ["./entities/activity.md", "entities/activities.md"],
  ["entities/../activity.md", "entities/activities.md"],
])
  test(`reject invalid source membership ${sources.join(",")}`, () =>
    assert.throws(() =>
      buildTopicGroups([{ ...definitions[0], sources }], entities, memberships, readings),
    ))
test("reject duplicate group, multiply owned source, missing reading and occupied routes", () => {
  assert.throws(() =>
    buildTopicGroups([...definitions, definitions[0]], entities, memberships, readings),
  )
  assert.throws(() =>
    buildTopicGroups(
      [...definitions, { ...definitions[0], id: "other" }],
      entities,
      memberships,
      readings,
    ),
  )
  assert.throws(() => buildTopicGroups(definitions, entities, memberships, new Map()))
  assert.throws(() =>
    buildTopicGroups(definitions, entities, memberships, readings, new Set(["topics/activity"])),
  )
})
