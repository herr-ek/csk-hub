import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import {
  cskToday,
  currentOrganisationYear,
  GroupType,
  organisationYearPeriod,
  PositionCode
} from "@/core/org-structure"
import { createOrganisationGroup, listEffectiveMembersAt } from "../appointments"
import { createOrgStructureTestDatabase, expectSuccess } from "../test-support"

const database = await createOrgStructureTestDatabase()
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const revalidatePath = mock(() => undefined)
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("next/cache", () => ({ revalidatePath }))
const { createGroupAction, renameGroupAction, archiveGroupAction } = await import("./groups/actions")
const { addMemberAction, endMembershipAction, changeVoiceAction, assignHolderAction, endHoldingAction } = await import(
  "./detail/actions"
)
const IDLE = { status: "idle" } as const
function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe.skipIf(!database)("existing Admin actions on the appointment model", () => {
  if (!database) return
  const t = database
  afterAll(t.drop)
  beforeEach(() => {
    requireAdmin.mockReset().mockResolvedValue({ state: "authenticated", userId: "admin-1" })
    revalidatePath.mockClear()
  })

  test("every retained action authorizes before parsing or writing", async () => {
    const denied = new Error("denied")
    requireAdmin.mockRejectedValue(denied)
    for (const action of [
      createGroupAction,
      renameGroupAction,
      archiveGroupAction,
      addMemberAction,
      endMembershipAction,
      changeVoiceAction,
      assignHolderAction,
      endHoldingAction
    ])
      await expect(action(IDLE, form({}))).rejects.toBe(denied)
    expect(await t.db.select().from(group)).toHaveLength(15)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("creates annual identities and refuses direct Board membership", async () => {
    const year = currentOrganisationYear(cskToday())
    expect(
      await createGroupAction(IDLE, form({ type: GroupType.Board, organisationYear: String(year) }))
    ).toMatchObject({ status: "success" })
    const [board] = await t.db
      .select()
      .from(group)
      .where(and(eq(group.type, GroupType.Board), eq(group.organisationYear, year)))
    if (!board) throw new Error("Missing Board")
    expect(board.name).toBeNull()
    expect(
      await addMemberAction(
        IDLE,
        form({ groupId: board.id, userId: await t.user(), startDate: organisationYearPeriod(year).startDate })
      )
    ).toEqual({ status: "error", error: "direct-membership-forbidden" })
    expect(await t.db.select().from(directMembership).where(eq(directMembership.groupId, board.id))).toEqual([])
  })

  test("the retained appointment form derives both rosters and ending it removes both grants", async () => {
    const year = currentOrganisationYear(cskToday())
    const startDate = organisationYearPeriod(year).startDate
    const [board] = await t.db.select().from(group).where(eq(group.type, GroupType.Board))
    if (!board) throw new Error("Missing Board")
    const social = expectSuccess(
      await createOrganisationGroup(t.db, { type: GroupType.SocialCommittee, organisationYear: year })
    )
    const userId = await t.user()
    expect(
      await assignHolderAction(
        IDLE,
        form({ groupId: board.id, positionId: PositionCode.SocialCoordinator, userId, startDate })
      )
    ).toMatchObject({ status: "success" })
    for (const id of [board.id, social.id])
      expect(await listEffectiveMembersAt(t.db, id, startDate)).toMatchObject([{ userId }])
    const [appointment] = await t.db.select().from(positionAppointment).where(eq(positionAppointment.userId, userId))
    if (!appointment) throw new Error("Missing appointment")
    expect(
      await endHoldingAction(IDLE, form({ appointmentId: appointment.id, endDate: `${year}-09-30` }))
    ).toMatchObject({ status: "success" })
    for (const id of [board.id, social.id]) expect(await listEffectiveMembersAt(t.db, id, `${year}-10-01`)).toEqual([])
    expect(
      await t.db.select().from(positionAppointment).where(eq(positionAppointment.id, appointment.id))
    ).toMatchObject([{ endDate: `${year}-10-01` }])
  })

  test("singer placement and ending use direct periods with inclusive form end dates", async () => {
    const sectionId = await t.groupId("MKB1", "MK")
    const userId = await t.user()
    expect(
      await addMemberAction(IDLE, form({ groupId: sectionId, userId, voice: "B1", startDate: "2026-08-01" }))
    ).toMatchObject({ status: "success" })
    expect(await endMembershipAction(IDLE, form({ groupId: sectionId, userId, endDate: "2026-09-30" }))).toMatchObject({
      status: "success"
    })
    expect(
      await t.db
        .select()
        .from(directMembership)
        .where(and(eq(directMembership.userId, userId), eq(directMembership.groupId, sectionId)))
    ).toMatchObject([{ startDate: "2026-08-01", endDate: "2026-10-01", voice: "B1" }])
  })
})
