import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { directMembership, group } from "@/core/db/schema/org-structure"
import { createOrgStructureTestDatabase } from "../test-support"

const database = await createOrgStructureTestDatabase()
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const revalidatePath = mock(() => undefined)
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("next/cache", () => ({ revalidatePath }))

const { createGroupAction, renameGroupAction, archiveGroupAction, prepareYearAction, editGroupAction } = await import(
  "./groups/actions"
)
const { addMemberAction, endMembershipAction, changeVoiceAction } = await import("./detail/actions")
const {
  assignAppointmentAction,
  replaceAppointmentAction,
  correctAppointmentAction,
  endAppointmentAction,
  cancelAppointmentAction
} = await import("./detail/appointment-actions")
const { addDirectMemberAction, correctDirectMemberAction, changeDirectMemberAction, endDirectMemberAction } =
  await import("./detail/direct-actions")
const { appointPosition, listAppointmentMembersAt } = await import("../appointments")
const { listDirectMembersAt, listDirectMemberships } = await import("../direct-membership")
const { listOrganisationGroups } = await import("../group-management")
const IDLE = { status: "idle" } as const
function form(values: Record<string, string | string[]>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item)
  return data
}

describe.skipIf(!database)("admin organisation Server Actions", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())
  beforeEach(() => {
    requireAdmin.mockClear()
    requireAdmin.mockImplementation(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
    revalidatePath.mockClear()
  })
  async function named(name: string) {
    const [row] = await t.db.select().from(group).where(eq(group.name, name))
    return row
  }

  test("guards every exported mutation before parsing or changing state", async () => {
    const actions = [
      createGroupAction,
      renameGroupAction,
      archiveGroupAction,
      prepareYearAction,
      editGroupAction,
      addDirectMemberAction,
      correctDirectMemberAction,
      changeDirectMemberAction,
      endDirectMemberAction,
      addMemberAction,
      endMembershipAction,
      changeVoiceAction,
      assignAppointmentAction,
      replaceAppointmentAction,
      correctAppointmentAction,
      endAppointmentAction,
      cancelAppointmentAction
    ]
    const denied = new Error("denied")
    requireAdmin.mockImplementation(async () => {
      throw denied
    })
    for (const action of actions) await expect(action(IDLE, form({}))).rejects.toBe(denied)
    expect(requireAdmin).toHaveBeenCalledTimes(actions.length)
    expect(await t.db.select().from(group)).toHaveLength(15)
  })

  test("creates, renames, archives, and passes typed policy failures through the action boundary", async () => {
    expect(await createGroupAction(IDLE, form({ name: "", type: "GigGroup" }))).toEqual({
      status: "error",
      error: "invalid-input"
    })
    expect(await createGroupAction(IDLE, form({ name: "Action gig", type: "GigGroup" }))).toMatchObject({
      status: "success"
    })
    const row = await named("Action gig")
    expect(await renameGroupAction(IDLE, form({ groupId: row!.id, name: "Renamed action gig" }))).toMatchObject({
      status: "success"
    })
    expect(await archiveGroupAction(IDLE, form({ groupId: row!.id }))).toMatchObject({ status: "success" })
    expect((await named("Renamed action gig"))?.active).toBe(false)
    expect(await archiveGroupAction(IDLE, form({ groupId: await t.groupId("KKB") }))).toEqual({
      status: "error",
      error: "section-archived-with-choir"
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  test("prepares annual groups and applies inclusive dates to direct membership actions", async () => {
    expect(await prepareYearAction(IDLE, form({ organisationYear: "2050" }))).toMatchObject({ status: "success" })
    const archive = (await listOrganisationGroups(t.db, "2050-09-01")).find(
      (row) => row.type === "Arkivarie" && row.organisationYear === 2050
    )!
    const userId = await t.user()
    expect(
      await addDirectMemberAction(
        IDLE,
        form({ groupId: archive.id, userId, startDate: "2050-09-01", lastDay: "2051-06-30" })
      )
    ).toMatchObject({ status: "success" })
    expect(await listDirectMembersAt(t.db, archive.id, "2051-06-30")).toMatchObject([{ userId }])
    const [membership] = await listDirectMemberships(t.db, archive.id)
    expect(
      await changeDirectMemberAction(
        IDLE,
        form({ membershipId: membership!.id, groupId: archive.id, startDate: "2050-10-01", lastDay: "2051-06-30" })
      )
    ).toMatchObject({ status: "success" })
    const changed = (await listDirectMemberships(t.db, archive.id)).find((row) => row.startDate === "2050-10-01")
    expect(
      await correctDirectMemberAction(
        IDLE,
        form({ membershipId: changed!.id, groupId: archive.id, startDate: "2050-10-01", lastDay: "2051-05-31" })
      )
    ).toMatchObject({ status: "success" })
    const directBeforeRefusal = await listDirectMemberships(t.db, archive.id)
    revalidatePath.mockClear()
    expect(
      await correctDirectMemberAction(
        IDLE,
        form({ membershipId: changed!.id, groupId: archive.id, startDate: "2050-10-01", lastDay: "2051-07-01" })
      )
    ).toEqual({ status: "error", error: "period-conflict" })
    expect(await listDirectMemberships(t.db, archive.id)).toEqual(directBeforeRefusal)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(
      await editGroupAction(
        IDLE,
        form({ groupId: archive.id, name: "Bad year correction", type: "Arkivarie", organisationYear: "2051" })
      )
    ).toEqual({ status: "error", error: "group-has-participation" })
    expect(await endDirectMemberAction(IDLE, form({ membershipId: changed!.id, lastDay: "2051-04-30" }))).toMatchObject(
      { status: "success" }
    )
    expect(await t.db.select().from(directMembership).where(eq(directMembership.id, changed!.id))).toMatchObject([
      { endDate: "2051-05-01" }
    ])
    expect(revalidatePath).toHaveBeenCalled()
  })

  test("the Choir member actions place into a Section, change Voice, and end Choir-owned Membership atomically", async () => {
    const userId = await t.user()
    const sectionId = await t.groupId("KKB")
    const choirId = await t.groupId("KK")
    expect(
      await addMemberAction(IDLE, form({ groupId: sectionId, userId, voice: "B2", startDate: "2024-08-01" }))
    ).toMatchObject({ status: "success" })
    expect(
      await addMemberAction(
        IDLE,
        form({ groupId: sectionId, userId: await t.user(), voice: "T1", startDate: "2024-08-01" })
      )
    ).toEqual({ status: "error", error: "voice-not-sung-in-section" })
    expect(
      await changeVoiceAction(IDLE, form({ groupId: sectionId, userId, voice: "B1", date: "2025-01-01" }))
    ).toMatchObject({ status: "success" })
    expect(await endMembershipAction(IDLE, form({ groupId: choirId, userId, endDate: "2025-06-01" }))).toMatchObject({
      status: "success"
    })
    expect(await listDirectMembersAt(t.db, choirId, "2025-06-01")).toEqual([])
    expect(await listDirectMembersAt(t.db, sectionId, "2025-06-01")).toEqual([])
  })

  test("replaces, corrects, ends, and cancels appointments through typed server actions", async () => {
    expect(await prepareYearAction(IDLE, form({ organisationYear: "2054" }))).toMatchObject({ status: "success" })
    const board = (await listOrganisationGroups(t.db, "2054-08-01")).find(
      (row) => row.type === "Board" && row.organisationYear === 2054
    )!
    const first = await t.user(),
      next = await t.user()
    const input = {
      positionCode: "ordforande",
      contextGroupId: board.id,
      organisationYear: "2054",
      startDate: "2054-08-01",
      lastDay: "2055-06-30"
    }
    expect(await assignAppointmentAction(IDLE, form({ ...input, userId: first }))).toMatchObject({ status: "success" })
    expect(
      await replaceAppointmentAction(IDLE, form({ ...input, userId: next, startDate: "2055-02-01" }))
    ).toMatchObject({ status: "success" })
    expect(await listAppointmentMembersAt(t.db, board.id, "2055-02-01")).toMatchObject([{ userId: next }])
    const current = (await listAppointmentMembersAt(t.db, board.id, "2055-02-01"))[0]!.appointments[0]!
    expect(
      await correctAppointmentAction(
        IDLE,
        form({ appointmentId: current.id, ...input, userId: next, startDate: "2055-02-01" })
      )
    ).toMatchObject({ status: "success" })
    const appointmentBeforeRefusal = await listAppointmentMembersAt(t.db, board.id, "2055-02-01")
    revalidatePath.mockClear()
    expect(
      await correctAppointmentAction(
        IDLE,
        form({
          appointmentId: current.id,
          ...input,
          userId: next,
          startDate: "2055-02-01",
          lastDay: "2055-07-01"
        })
      )
    ).toEqual({ status: "error", error: "period-conflict" })
    expect(await listAppointmentMembersAt(t.db, board.id, "2055-02-01")).toEqual(appointmentBeforeRefusal)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(await endAppointmentAction(IDLE, form({ appointmentId: current.id, lastDay: "2055-05-31" }))).toMatchObject({
      status: "success"
    })
    const future = await appointPosition(t.db, {
      userId: await t.user(),
      positionCode: "vice-ordforande",
      contextGroupId: board.id,
      startDate: "2054-09-01"
    })
    if (!future.success) throw new Error(future.error)
    expect(await cancelAppointmentAction(IDLE, form({ appointmentId: future.data.id }))).toMatchObject({
      status: "success"
    })
    expect(await listAppointmentMembersAt(t.db, board.id, "2054-10-01")).toMatchObject([{ userId: first }])
    expect(revalidatePath).toHaveBeenCalled()
  })

  test("the cancel action trusts server time and refuses a forged date after an appointment started", async () => {
    expect(await prepareYearAction(IDLE, form({ organisationYear: "2024" }))).toMatchObject({ status: "success" })
    const board = (await listOrganisationGroups(t.db, "2024-09-01")).find(
      (row) => row.type === "Board" && row.organisationYear === 2024
    )!
    const userId = await t.user()
    const appointment = await appointPosition(t.db, {
      userId,
      positionCode: "ordforande",
      contextGroupId: board.id,
      startDate: "2024-09-01"
    })
    if (!appointment.success) throw new Error(appointment.error)
    revalidatePath.mockClear()
    expect(
      await cancelAppointmentAction(IDLE, form({ appointmentId: appointment.data.id, today: "2024-08-01" }))
    ).toEqual({ status: "error", error: "period-conflict" })
    expect(await listAppointmentMembersAt(t.db, board.id, "2024-10-01")).toMatchObject([{ userId }])
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
