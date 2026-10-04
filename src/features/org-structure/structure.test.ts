import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { choir, group, section } from "@/core/db/schema/org-structure"
import type { Voice } from "@/features/voice/model"
import { archiveGroup, createChoir, createGroup, createPosition } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createOrgStructureTestDatabase()

const fourSections = (prefix: string): { name: string; voice: Voice }[] => [
  { name: `${prefix}S`, voice: "S" },
  { name: `${prefix}A`, voice: "A" },
  { name: `${prefix}T`, voice: "T" },
  { name: `${prefix}B`, voice: "B" }
]

describe.skipIf(!database)("groups structure", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  describe("createChoir", () => {
    test("creates a CSK-wide Choir group with its extension and four Sections", async () => {
      const name = uniqueName("Choir")
      const { choirId, sections } = expectSuccess(await createChoir(t.db, { name, sections: fourSections("X") }))

      const [row] = await t.db.select().from(group).where(eq(group.id, choirId))
      expect(row).toMatchObject({ type: "Choir", choirId: null, active: true })
      expect(await t.db.select().from(choir).where(eq(choir.groupId, choirId))).toHaveLength(1)
      expect(sections.map(({ voice }) => voice)).toEqual(["S", "A", "T", "B"])
      const extensions = await t.db
        .select({ voice: section.voice })
        .from(section)
        .innerJoin(group, eq(group.id, section.groupId))
        .where(eq(group.choirId, choirId))
      expect(extensions).toHaveLength(4)
    })

    test("requires exactly four Sections", async () => {
      const result = await createChoir(t.db, { name: uniqueName("Choir"), sections: fourSections("X").slice(0, 3) })
      expect(result).toEqual({ success: false, error: "section-count" })
    })

    test("refuses the same Voice in two Sections of the Choir", async () => {
      const sections = fourSections("X")
      sections[3] = { name: "XB", voice: "T" }
      const result = await createChoir(t.db, { name: uniqueName("Choir"), sections })
      expect(result).toEqual({ success: false, error: "voice-in-several-sections" })
    })

    test("refuses overlapping Sections: a family alongside one of its divisions", async () => {
      const sections: { name: string; voice: Voice }[] = [
        { name: "XT1", voice: "T1" },
        { name: "XT2", voice: "T2" },
        { name: "XB", voice: "B" },
        { name: "XB1", voice: "B1" }
      ]
      const result = await createChoir(t.db, { name: uniqueName("Choir"), sections })
      expect(result).toEqual({ success: false, error: "voice-in-several-sections" })
    })

    test("allows divisions of one family in separate Sections", async () => {
      const sections: { name: string; voice: Voice }[] = [
        { name: "XT1", voice: "T1" },
        { name: "XT2", voice: "T2" },
        { name: "XB1", voice: "B1" },
        { name: "XB2", voice: "B2" }
      ]
      expectSuccess(await createChoir(t.db, { name: uniqueName("Choir"), sections }))
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
