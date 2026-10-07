import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { and, eq, isNull } from "drizzle-orm"
import { group, groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { createOrgStructureTestDatabase } from "../test-support"

// The admin Server Actions against a real, throwaway database: only the Admin guard and cache
// revalidation are replaced, so typed failures travel the whole way from the module.

const database = await createOrgStructureTestDatabase()

const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const revalidatePath = mock(() => undefined)

mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("next/cache", () => ({ revalidatePath }))

const { createGroupAction, renameGroupAction, archiveGroupAction } = await import("./structure/actions")
const { addMemberAction, endMembershipAction, changeVoiceAction, assignHolderAction, endHoldingAction } = await import(
  "./detail/actions"
)
const { createPositionAction, updatePositionAction } = await import("./catalogue/actions")

const IDLE = { status: "idle" } as const

function form(values: Record<string, string | string[]>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  }
  return data
}

describe.skipIf(!database)("admin groups Server Actions", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  beforeEach(() => {
    requireAdmin.mockClear()
    requireAdmin.mockImplementation(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
    revalidatePath.mockClear()
  })

  async function groupNamed(name: string) {
    const [row] = await t.db.select().from(group).where(eq(group.name, name))
    return row
  }

  describe("the Admin guard", () => {
    test("refuses a non-Admin before validating or writing anything", async () => {
      const denied = new Error("denied")
      requireAdmin.mockImplementation(async () => {
        throw denied
      })

      await expect(createGroupAction(IDLE, form({ name: "Smygkommittén", type: "Valberedning" }))).rejects.toBe(denied)
      await expect(addMemberAction(IDLE, form({ groupId: "not-a-uuid" }))).rejects.toBe(denied)
      await expect(createPositionAction(IDLE, form({ name: "Smygpost" }))).rejects.toBe(denied)

      expect(await groupNamed("Smygkommittén")).toBeUndefined()
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    test("guards every action", async () => {
      const actions = [
        createGroupAction,
        renameGroupAction,
        archiveGroupAction,
        addMemberAction,
        endMembershipAction,
        changeVoiceAction,
        assignHolderAction,
        endHoldingAction,
        createPositionAction,
        updatePositionAction
      ]
      for (const action of actions) await action(IDLE, form({}))
      expect(requireAdmin).toHaveBeenCalledTimes(actions.length)
    })
  })

  describe("structure", () => {
    test("creates, renames and archives a group, revalidating the admin pages", async () => {
      const created = await createGroupAction(
        IDLE,
        form({ name: "KK roddgrupp", type: "Roddgrupp", choirId: await t.groupId("KK") })
      )
      expect(created).toMatchObject({ status: "success" })
      expect(revalidatePath).toHaveBeenCalledWith("/admin/groups", "layout")
      const row = await groupNamed("KK roddgrupp")
      expect(row?.choirId).toBe(await t.groupId("KK"))

      expect(await renameGroupAction(IDLE, form({ groupId: row?.id as string, name: "KK rodd" }))).toMatchObject({
        status: "success"
      })
      expect(await archiveGroupAction(IDLE, form({ groupId: row?.id as string }))).toMatchObject({ status: "success" })
      expect((await groupNamed("KK rodd"))?.active).toBe(false)
    })

    test("passes a module violation through as a typed failure", async () => {
      expect(await createGroupAction(IDLE, form({ name: "Styret", type: "Board" }))).toEqual({
        status: "error",
        error: "group-name-taken"
      })
      expect(await archiveGroupAction(IDLE, form({ groupId: await t.groupId("KKB") }))).toEqual({
        status: "error",
        error: "section-archived-with-choir"
      })
      expect(revalidatePath).not.toHaveBeenCalled()
    })

    test("refuses Choir and Section types and malformed input as invalid input", async () => {
      expect(await createGroupAction(IDLE, form({ name: "Ny kör", type: "Choir" }))).toEqual({
        status: "error",
        error: "invalid-input"
      })
      expect(await renameGroupAction(IDLE, form({ groupId: "nope", name: "X" }))).toEqual({
        status: "error",
        error: "invalid-input"
      })
    })
  })

  describe("members", () => {
    test("adds a singer to a Section with a Voice, which makes them a Choir member", async () => {
      const userId = await t.user()
      const kkb = await t.groupId("KKB")
      expect(
        await addMemberAction(IDLE, form({ groupId: kkb, userId, voice: "B2", startDate: "2025-08-25" }))
      ).toMatchObject({ status: "success" })

      const memberships = await t.db
        .select({ groupId: groupMember.groupId, voice: groupMember.voice })
        .from(groupMember)
        .where(eq(groupMember.userId, userId))
      expect(memberships).toEqual(
        expect.arrayContaining([
          { groupId: kkb, voice: "B2" },
          { groupId: await t.groupId("KK"), voice: null }
        ])
      )
    })

    test("refuses a Voice the Section does not sing", async () => {
      const userId = await t.user()
      expect(
        await addMemberAction(
          IDLE,
          form({ groupId: await t.groupId("KKB"), userId, voice: "T1", startDate: "2025-08-25" })
        )
      ).toEqual({ status: "error", error: "voice-not-sung-in-section" })
    })

    test("changes a Voice by ending the old row, and ends Positions with the Membership", async () => {
      const userId = await t.user()
      const [mk, mkb2] = [await t.groupId("MK"), await t.groupId("MKB2")]
      await addMemberAction(IDLE, form({ groupId: mkb2, userId, voice: "B2", startDate: "2024-08-25" }))
      expect(
        await changeVoiceAction(IDLE, form({ groupId: mkb2, userId, voice: "B1", date: "2025-08-25" }))
      ).toMatchObject({ status: "success" })
      const rows = await t.db
        .select({ endDate: groupMember.endDate })
        .from(groupMember)
        .where(and(eq(groupMember.userId, userId), eq(groupMember.groupId, mkb2)))
      expect(rows).toEqual([{ endDate: "2025-08-25" }])

      const notfiskal = await t.positionId("Notfiskal")
      await assignHolderAction(IDLE, form({ groupId: mk, positionId: notfiskal, userId, startDate: "2025-09-01" }))
      expect(await endMembershipAction(IDLE, form({ groupId: mk, userId, endDate: "2026-06-30" }))).toMatchObject({
        status: "success"
      })
      const holdings = await t.db
        .select()
        .from(positionHolder)
        .where(and(eq(positionHolder.userId, userId), isNull(positionHolder.endDate)))
      expect(holdings).toEqual([])
    })

    test("refuses to change the Voice of someone who does not sing in the Choir", async () => {
      expect(
        await changeVoiceAction(
          IDLE,
          form({ groupId: await t.groupId("DKS1"), userId: await t.user(), voice: "S2", date: "2025-08-25" })
        )
      ).toEqual({ status: "error", error: "not-a-singer" })
    })
  })

  describe("Positions", () => {
    test("assigns, replaces and ends a holder, only among current members", async () => {
      const dk = await t.groupId("DK")
      const conductor = await t.positionId("Dirigent")
      const [first, second, outsider] = [await t.user(), await t.user(), await t.user()]
      for (const userId of [first, second]) {
        await addMemberAction(IDLE, form({ groupId: dk, userId, startDate: "2025-01-01" }))
      }

      expect(
        await assignHolderAction(
          IDLE,
          form({ groupId: dk, positionId: conductor, userId: outsider, startDate: "2025-02-01" })
        )
      ).toEqual({ status: "error", error: "not-a-member" })
      await assignHolderAction(
        IDLE,
        form({ groupId: dk, positionId: conductor, userId: first, startDate: "2025-02-01" })
      )
      await assignHolderAction(
        IDLE,
        form({ groupId: dk, positionId: conductor, userId: second, startDate: "2025-08-01" })
      )
      expect(
        await endHoldingAction(
          IDLE,
          form({ groupId: dk, positionId: conductor, userId: second, endDate: "2026-01-01" })
        )
      ).toMatchObject({ status: "success" })

      const holdings = await t.db
        .select({ userId: positionHolder.userId, startDate: positionHolder.startDate, endDate: positionHolder.endDate })
        .from(positionHolder)
        .where(and(eq(positionHolder.groupId, dk), eq(positionHolder.positionId, conductor)))
        .orderBy(positionHolder.startDate)
      expect(holdings).toEqual([
        { userId: first, startDate: "2025-02-01", endDate: "2025-08-01" },
        { userId: second, startDate: "2025-08-01", endDate: "2026-01-01" }
      ])
    })

    test("refuses a Position the group type does not allow", async () => {
      const userId = await t.user()
      const styret = await t.groupId("Styret")
      await addMemberAction(IDLE, form({ groupId: styret, userId, startDate: "2025-01-01" }))
      expect(
        await assignHolderAction(
          IDLE,
          form({ groupId: styret, positionId: await t.positionId("Dirigent"), userId, startDate: "2025-01-01" })
        )
      ).toEqual({ status: "error", error: "position-not-allowed" })
    })

    test("creates and edits Positions in the catalogue", async () => {
      expect(await createPositionAction(IDLE, form({ name: "Kassör", groupTypes: ["Board"] }))).toMatchObject({
        status: "success"
      })
      expect(await createPositionAction(IDLE, form({ name: "Kassör", groupTypes: [] }))).toEqual({
        status: "error",
        error: "position-name-taken"
      })
      const kassor = await t.positionId("Kassör")
      expect(
        await updatePositionAction(
          IDLE,
          form({ positionId: kassor, name: "Skattmästare", groupTypes: ["Board", "Valberedning"] })
        )
      ).toMatchObject({ status: "success" })
      expect(await t.positionId("Skattmästare")).toBe(kassor)
    })
  })
})
