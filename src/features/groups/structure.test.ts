import { afterAll, describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { choir, group, groupTypePosition, position, sectionVoice } from "@/core/db/schema/groups"
import type { Voice } from "./model"
import { REFERENCE_DATA } from "./reference-data"
import { archiveGroup, createChoir, createGroup, createPosition } from "./structure"
import { createGroupsTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createGroupsTestDatabase()

const fourSections = (prefix: string): { name: string; voices: Voice[] }[] => [
  { name: `${prefix}S`, voices: ["S1", "S2"] },
  { name: `${prefix}A`, voices: ["A1", "A2"] },
  { name: `${prefix}T`, voices: ["T1", "T2"] },
  { name: `${prefix}B`, voices: ["B1", "B2"] }
]

describe.skipIf(!database)("groups structure", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function sectionsOf(choirName: string) {
    const choirId = await t.groupId(choirName)
    const rows = await t.db
      .select({ name: group.name, voice: sectionVoice.voice })
      .from(group)
      .innerJoin(sectionVoice, eq(sectionVoice.sectionId, group.id))
      .where(and(eq(group.choirId, choirId), eq(group.type, "Section")))
      .orderBy(group.name, sectionVoice.voice)
    return rows.map(({ name, voice }) => `${name}:${voice}`).sort()
  }

  describe("reference data", () => {
    test("the migration creates the Choirs, their Sections and Voices, the Board and the Positions", async () => {
      for (const definition of REFERENCE_DATA.choirs) {
        const expected = definition.sections
          .flatMap(({ name, voices }) => voices.map((voice) => `${name}:${voice}`))
          .sort()
        expect(await sectionsOf(definition.name)).toEqual(expected)
      }
      expect(await t.db.select().from(choir)).toHaveLength(REFERENCE_DATA.choirs.length)

      for (const { name, type } of REFERENCE_DATA.groups) {
        const [row] = await t.db
          .select()
          .from(group)
          .where(eq(group.id, await t.groupId(name)))
        expect(row).toMatchObject({ type, choirId: null })
      }

      const allowed = await t.db
        .select({ name: position.name, type: groupTypePosition.type })
        .from(groupTypePosition)
        .innerJoin(position, eq(position.id, groupTypePosition.positionId))
      expect(allowed.map(({ name, type }) => `${name}:${type}`).sort()).toEqual(
        REFERENCE_DATA.positions.flatMap(({ name, groupTypes }) => groupTypes.map((type) => `${name}:${type}`)).sort()
      )
    })
  })

  describe("createChoir", () => {
    test("creates a CSK-wide Choir group with its extension and four Sections", async () => {
      const name = uniqueName("Choir")
      const { choirId, sections } = expectSuccess(await createChoir(t.db, { name, sections: fourSections("X") }))

      const [row] = await t.db.select().from(group).where(eq(group.id, choirId))
      expect(row).toMatchObject({ type: "Choir", choirId: null, active: true })
      expect(await t.db.select().from(choir).where(eq(choir.groupId, choirId))).toHaveLength(1)
      expect(sections).toHaveLength(4)
    })

    test("requires exactly four Sections", async () => {
      const result = await createChoir(t.db, { name: uniqueName("Choir"), sections: fourSections("X").slice(0, 3) })
      expect(result).toEqual({ success: false, error: "section-count" })
    })

    test("requires every Section to sing at least one Voice", async () => {
      const sections = fourSections("X")
      sections[3] = { name: "XB", voices: [] }
      const result = await createChoir(t.db, { name: uniqueName("Choir"), sections })
      expect(result).toEqual({ success: false, error: "section-without-voice" })
    })

    test("refuses a Voice in more than one Section of the Choir", async () => {
      const sections = fourSections("X")
      sections[3] = { name: "XB", voices: ["B1", "T2"] }
      const result = await createChoir(t.db, { name: uniqueName("Choir"), sections })
      expect(result).toEqual({ success: false, error: "voice-in-several-sections" })
    })

    test("leaves nothing behind when refused", async () => {
      const name = uniqueName("Choir")
      await createChoir(t.db, { name, sections: fourSections("X").slice(0, 2) })
      expect(await t.db.select().from(group).where(eq(group.name, name))).toEqual([])
    })
  })

  describe("createGroup", () => {
    test("creates a CSK-wide group, or one that belongs to a Choir", async () => {
      const board = expectSuccess(await createGroup(t.db, { name: uniqueName("Styret"), type: "Board" }))
      const rodd = expectSuccess(
        await createGroup(t.db, { name: "MK roddgrupp", type: "Rodd", choirId: await t.groupId("MK") })
      )

      const rows = await t.db.select().from(group).where(eq(group.id, board.id))
      expect(rows[0]?.choirId).toBeNull()
      const [roddRow] = await t.db.select().from(group).where(eq(group.id, rodd.id))
      expect(roddRow?.choirId).toBe(await t.groupId("MK"))
    })

    test("only belongs to a Choir: no deeper hierarchy", async () => {
      const result = await createGroup(t.db, {
        name: uniqueName("Sub"),
        type: "Rodd",
        choirId: await t.groupId("MKB1")
      })
      expect(result).toEqual({ success: false, error: "choir-not-found" })
    })

    test("never creates a Choir or a Section on its own", async () => {
      for (const type of ["Choir", "Section"] as const) {
        const result = await createGroup(t.db, { name: uniqueName(type), type: type as never })
        expect(result).toEqual({ success: false, error: "choir-created-with-sections" })
      }
    })

    test("reports a name already taken among active groups in the same scope", async () => {
      const name = uniqueName("Committee")
      expectSuccess(await createGroup(t.db, { name, type: "Committee" }))
      expect(await createGroup(t.db, { name, type: "Committee" })).toEqual({
        success: false,
        error: "group-name-taken"
      })
      expectSuccess(await createGroup(t.db, { name, type: "Committee", choirId: await t.groupId("DK") }))
    })

    test("refuses an archived Choir", async () => {
      const { choirId } = expectSuccess(
        await createChoir(t.db, { name: uniqueName("Choir"), sections: fourSections("Y") })
      )
      expectSuccess(await archiveGroup(t.db, choirId))
      expect(await createGroup(t.db, { name: uniqueName("Fest"), type: "Fest", choirId })).toEqual({
        success: false,
        error: "group-archived"
      })
    })
  })

  describe("archiveGroup", () => {
    test("archives rather than deletes, freeing the name", async () => {
      const name = uniqueName("Gig")
      const { id } = expectSuccess(await createGroup(t.db, { name, type: "GigGroup" }))
      expectSuccess(await archiveGroup(t.db, id))

      const [row] = await t.db.select().from(group).where(eq(group.id, id))
      expect(row?.active).toBe(false)
      expectSuccess(await createGroup(t.db, { name, type: "GigGroup" }))
      expect(await archiveGroup(t.db, id)).toEqual({ success: false, error: "group-archived" })
    })

    test("archives a Choir with its Sections, and never a Section alone", async () => {
      const { choirId, sections } = expectSuccess(
        await createChoir(t.db, { name: uniqueName("Choir"), sections: fourSections("Z") })
      )
      expect(await archiveGroup(t.db, sections[0]?.id as string)).toEqual({
        success: false,
        error: "section-archived-with-choir"
      })

      expectSuccess(await archiveGroup(t.db, choirId))
      const rows = await t.db.select({ active: group.active }).from(group).where(eq(group.choirId, choirId))
      expect(rows.map(({ active }) => active)).toEqual([false, false, false, false])
    })
  })

  test("createPosition reports a taken name", async () => {
    const name = uniqueName("Kassör")
    expectSuccess(await createPosition(t.db, { name, groupTypes: ["Board"] }))
    expect(await createPosition(t.db, { name, groupTypes: [] })).toEqual({
      success: false,
      error: "position-name-taken"
    })
  })
})
