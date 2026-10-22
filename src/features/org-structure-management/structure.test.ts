import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { group, section } from "@/core/db/schema/org-structure"
import { createOrganisationGroup } from "./appointments"
import { archiveGroup, createChoir, renameGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("Choir and Group structure", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("a Choir is created with exactly four non-overlapping Sections", async () => {
    const name = uniqueName("Choir structure")
    expect(
      await createChoir(t.db, {
        name,
        sections: [
          { name: "Soprano", voice: "S" },
          { name: "Alto", voice: "A" },
          { name: "Tenor", voice: "T" },
          { name: "Bass", voice: "B" }
        ]
      })
    ).toMatchObject({
      success: true,
      data: { sections: [{ voice: "S" }, { voice: "A" }, { voice: "T" }, { voice: "B" }] }
    })
    const [choir] = await t.db.select().from(group).where(eq(group.name, name))
    expect(choir?.type).toBe("Choir")
    if (!choir) throw new Error("Expected the Choir to exist.")
    const sectionRows = await t.db.select({ id: group.id }).from(group).where(eq(group.choirId, choir.id))
    expect(sectionRows).toHaveLength(4)
    const firstSection = sectionRows[0]
    if (!firstSection) throw new Error("Expected the first Section to exist.")
    expect(await t.db.select().from(section).where(eq(section.groupId, firstSection.id))).toHaveLength(1)
  })

  test("invalid or overlapping Section sets leave no Choir behind", async () => {
    const name = uniqueName("Rejected choir")
    expect(await createChoir(t.db, { name, sections: [{ name: "one", voice: "S" }] })).toEqual({
      success: false,
      error: "section-count"
    })
    expect(
      await createChoir(t.db, {
        name,
        sections: [
          { name: "one", voice: "B" },
          { name: "two", voice: "B1" },
          { name: "three", voice: "S" },
          { name: "four", voice: "A" }
        ]
      })
    ).toEqual({ success: false, error: "voice-in-several-sections" })
    expect(await t.db.select().from(group).where(eq(group.name, name))).toEqual([])
  })

  test("scope, names and archival rules protect the Choir tree", async () => {
    const choirId = await t.groupId("KK")
    const sectionId = await t.groupId("KKB")
    expect(await createOrganisationGroup(t.db, { name: uniqueName("Bad scoped"), type: "GigGroup", choirId })).toEqual({
      success: false,
      error: "invalid-group-scope"
    })
    const existingName = `Unique ${crypto.randomUUID()}`
    const first = expectSuccess(await createOrganisationGroup(t.db, { name: existingName, type: "Övrig" }))
    expect(await createOrganisationGroup(t.db, { name: existingName, type: "Övrig" })).toEqual({
      success: false,
      error: "group-name-taken"
    })
    expect(await renameGroup(t.db, first.id, " ")).toEqual({ success: false, error: "invalid-group-name" })
    expect(await archiveGroup(t.db, sectionId)).toEqual({ success: false, error: "section-archived-with-choir" })
    expectSuccess(await archiveGroup(t.db, choirId))
    expect(await t.db.select({ active: group.active }).from(group).where(eq(group.id, choirId))).toEqual([
      { active: false }
    ])
    expect(await t.db.select({ active: group.active }).from(group).where(eq(group.id, sectionId))).toEqual([
      { active: false }
    ])
  })
})
