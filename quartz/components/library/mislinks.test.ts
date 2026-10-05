import test from "node:test"
import assert from "node:assert/strict"
import {
  auditGivenNameLinks,
  entityKey,
  givenNameMislink,
  hrefEntityKey,
  nameOnlyTargets,
} from "./mislinks"

test("entity keys normalize labels, wikilink targets and hrefs alike", () => {
  assert.equal(entityKey("John (Apostle)"), "john-apostle")
  assert.equal(entityKey("Virgin Mary"), "virgin-mary")
  assert.equal(hrefEntityKey("../entities/virgin-mary"), "virgin-mary")
  assert.equal(hrefEntityKey("../entities/Virgin-Mary.html#x"), "virgin-mary")
  assert.equal(hrefEntityKey("https://example.com/virgin-mary"), undefined)
  assert.equal(hrefEntityKey("#p3"), undefined)
})

test("flags only bare given names in person-name context", () => {
  const vm = "virgin-mary"
  assert.equal(givenNameMislink(vm, "Mary", "copy to Miss ", " C. Clendenin"), "honorific")
  assert.equal(givenNameMislink(vm, "Mary", "through ", " C. Clendenin"), "initial")
  assert.equal(givenNameMislink(vm, "Mary", "Steno. ", " Wirsing and"), "surname")
  assert.equal(givenNameMislink(vm, "Mary", "at William & ", " College"), "honorific")
  assert.equal(givenNameMislink("king-david", "David", "Lucille, S. ", " and Richard"), "honorific")
  assert.equal(
    givenNameMislink("john-apostle", "John", "Harry Eastman of ", " Deer Plow"),
    "surname",
  )
  // Full labels and other targets are never touched.
  assert.equal(givenNameMislink(vm, "Virgin Mary", "Dr. ", " Miller"), undefined)
  assert.equal(givenNameMislink("atlantis", "Atlantis", "Dr. ", " Smith"), undefined)
  // Biblical and ambiguous contexts are kept.
  assert.equal(givenNameMislink(vm, "Mary", "husband of ", ", mother of the Lord"), undefined)
  assert.equal(givenNameMislink(vm, "Mary", "Martha, ", " and Lazarus"), undefined)
  assert.equal(givenNameMislink(vm, "Mary", "beginning ", " WAS the twin-soul"), undefined)
  assert.equal(givenNameMislink(vm, "Mary", "the other ", " the sister of Martha"), undefined)
  assert.equal(givenNameMislink(vm, "Mary", "up to ", "'s so I hope"), undefined)
  assert.equal(givenNameMislink(vm, "MARY", "HAVE DR. ", " MILLER 105"), "honorific")
  assert.equal(givenNameMislink(vm, "MARY", "TO ", " MILLER 105"), "surname")
})

test("markdown audit ignores frontmatter and generated index sections", () => {
  const source = [
    "---",
    'entities: ["Virgin Mary"]',
    "---",
    "## Text",
    "a copy is being sent to Miss [[Virgin Mary|Mary]] C. Clendenin (who sponsored)",
    "I was not able to go to Dr. T. [[[John (Apostle)|John]] R. Thompson].",
    "## Mentioned Entities",
    "[[Virgin Mary]], [[John (Apostle)]]",
  ].join("\n")
  const audit = auditGivenNameLinks(source)
  assert.deepEqual(audit.get("virgin-mary"), { flagged: 1, kept: 0 })
  assert.deepEqual(audit.get("john-apostle"), { flagged: 1, kept: 0 })
  assert.deepEqual([...nameOnlyTargets(source)].sort(), ["john-apostle", "virgin-mary"])
  const mixed = source.replace(
    "## Mentioned",
    "the mother of Jesus, [[Virgin Mary|Mary]], was chosen\n## Mentioned",
  )
  assert.deepEqual([...nameOnlyTargets(mixed)], ["john-apostle"])
  assert.equal(
    nameOnlyTargets("> R4. 3/4/38 Dr. [[Virgin Mary|Mary]]\n> A. Miller's report").size,
    1,
  )
})
