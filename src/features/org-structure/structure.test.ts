import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { choir, group, groupTypePosition, position, section } from "@/core/db/schema/org-structure"
import type { Voice } from "@/features/voice/model"
import { startMembership } from "./membership"
import { startPositionHolding } from "./positions"
import {
  archiveGroup,
  createChoir,
  createGroup,
  createPosition,
  renameGroup,
  renamePosition,
  setPositionGroupTypes,
  updatePosition
} from "./structure"
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
        await createGroup(t.db, { name: "MK roddgrupp", type: "Roddgrupp", choirId: await t.groupId("MK") })
      )

      const rows = await t.db.select().from(group).where(eq(group.id, board.id))
      expect(rows[0]?.choirId).toBeNull()
      const [roddRow] = await t.db.select().from(group).where(eq(group.id, rodd.id))
      expect(roddRow?.choirId).toBe(await t.groupId("MK"))
    })

    test("only belongs to a Choir: no deeper hierarchy", async () => {
      const result = await createGroup(t.db, {
        name: uniqueName("Sub"),
        type: "Roddgrupp",
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
      const name = uniqueName("Valberedning")
      expectSuccess(await createGroup(t.db, { name, type: "Valberedning" }))
      expect(await createGroup(t.db, { name, type: "Valberedning" })).toEqual({
        success: false,
        error: "group-name-taken"
      })
      expectSuccess(await createGroup(t.db, { name, type: "Valberedning", choirId: await t.groupId("DK") }))
    })

    test("refuses an archived Choir", async () => {
      const { choirId } = expectSuccess(
        await createChoir(t.db, { name: uniqueName("Choir"), sections: fourSections("Y") })
      )
      expectSuccess(await archiveGroup(t.db, choirId))
      expect(await createGroup(t.db, { name: uniqueName("Festgrupp"), type: "Festgrupp", choirId })).toEqual({
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

  describe("renameGroup", () => {
    test("renames an active group, keeping names unique within the Choir", async () => {
      const kk = await t.groupId("KK")
      const taken = uniqueName("Festgrupp")
      expectSuccess(await createGroup(t.db, { name: taken, type: "Festgrupp", choirId: kk }))
      const { id } = expectSuccess(
        await createGroup(t.db, { name: uniqueName("Festgrupp"), type: "Festgrupp", choirId: kk })
      )

      expect(await renameGroup(t.db, id, taken)).toEqual({ success: false, error: "group-name-taken" })
      const renamed = uniqueName("KK festgrupp")
      expectSuccess(await renameGroup(t.db, id, renamed))
      const [row] = await t.db.select().from(group).where(eq(group.id, id))
      expect(row?.name).toBe(renamed)

      expectSuccess(await archiveGroup(t.db, id))
      expect(await renameGroup(t.db, id, uniqueName("Festgrupp"))).toEqual({ success: false, error: "group-archived" })
    })
  })

  describe("Position catalogue", () => {
    test("renames a Position and reports a taken name", async () => {
      const { id } = expectSuccess(await createPosition(t.db, { name: uniqueName("Kassör"), groupTypes: ["Board"] }))
      const renamed = uniqueName("Skattmästare")
      expectSuccess(await renamePosition(t.db, id, renamed))
      expect(await renamePosition(t.db, id, "Dirigent")).toEqual({ success: false, error: "position-name-taken" })
    })

    test("replaces the allowed GroupTypes, but keeps a type someone holds the Position in", async () => {
      const { id } = expectSuccess(await createPosition(t.db, { name: uniqueName("Arkivarie"), groupTypes: ["Board"] }))
      expectSuccess(await setPositionGroupTypes(t.db, id, ["Board", "Valberedning"]))
      const types = async () =>
        (
          await t.db
            .select({ type: groupTypePosition.type })
            .from(groupTypePosition)
            .where(eq(groupTypePosition.positionId, id))
        )
          .map(({ type }) => type)
          .sort()
      expect(await types()).toEqual(["Board", "Valberedning"])

      const styret = await t.groupId("Styret")
      const userId = await t.user()
      expectSuccess(await startMembership(t.db, { userId, groupId: styret, startDate: "2025-01-01" }))
      expectSuccess(
        await startPositionHolding(t.db, { userId, groupId: styret, positionId: id, startDate: "2025-01-01" })
      )

      expect(await setPositionGroupTypes(t.db, id, ["Valberedning"])).toEqual({
        success: false,
        error: "position-in-use"
      })
      expectSuccess(await setPositionGroupTypes(t.db, id, ["Board"]))
      expect(await types()).toEqual(["Board"])
    })

    test("updatePosition renames and retypes together, or not at all", async () => {
      const name = uniqueName("Fanbärare")
      const { id } = expectSuccess(await createPosition(t.db, { name, groupTypes: ["Board"] }))
      const styret = await t.groupId("Styret")
      const userId = await t.user()
      expectSuccess(await startMembership(t.db, { userId, groupId: styret, startDate: "2025-01-01" }))
      expectSuccess(
        await startPositionHolding(t.db, { userId, groupId: styret, positionId: id, startDate: "2025-01-01" })
      )

      expect(
        await updatePosition(t.db, { positionId: id, name: uniqueName("Fana"), groupTypes: ["Festgrupp"] })
      ).toEqual({
        success: false,
        error: "position-in-use"
      })
      const [row] = await t.db.select({ name: position.name }).from(position).where(eq(position.id, id))
      expect(row?.name).toBe(name)
    })
  })
})
