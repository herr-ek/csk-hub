import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test"
import { eq } from "drizzle-orm"
import { directMembership, group } from "@/core/db/schema/org-structure"
import * as intlServer from "@/core/i18n/server"
import { GroupType, PositionCode } from "@/core/org-structure"
import { createOrgStructureTestDatabase } from "../test-support"

const database = await createOrgStructureTestDatabase()
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const revalidatePath = mock(() => undefined)
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("next/cache", () => ({ revalidatePath }))
mock.module("@/core/i18n/server", () => ({ ...intlServer, getTranslations: async () => (key: string) => key }))

const { createGroupAction, renameGroupAction, archiveGroupAction, prepareYearAction, editGroupAction } = await import(
  "./groups/actions"
)
const { createGigGroupAction } = await import("./gig-groups/actions")
const { addMemberAction, endMembershipAction, changeVoiceAction } = await import("./detail/actions")
const { getGroupDetail } = await import("./detail/query")
const {
  assignAppointmentAction,
  replaceAppointmentAction,
  correctAppointmentAction,
  endAppointmentAction,
  cancelAppointmentAction
} = await import("./detail/appointment-actions")
const {
  addDirectMemberAction,
  correctDirectMemberAction,
  changeDirectMemberAction,
  endDirectMemberAction,
  endChoirMemberAction
} = await import("./detail/direct-actions")
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
  afterAll(async () => {
    setSystemTime()
    await t.drop()
  })
  beforeEach(() => {
    setSystemTime(new Date("2053-10-22T12:00:00Z"))
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
      createGigGroupAction,
      renameGroupAction,
      archiveGroupAction,
      prepareYearAction,
      editGroupAction,
      addDirectMemberAction,
      correctDirectMemberAction,
      changeDirectMemberAction,
      endDirectMemberAction,
      endChoirMemberAction,
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

  test("refuses forged annual years beyond the following year without revalidation", async () => {
    expect(await prepareYearAction(IDLE, form({ organisationYear: "2055" }))).toEqual({
      status: "error",
      error: "organisation-year-too-far-ahead"
    })
    expect(
      await createGroupAction(IDLE, form({ name: "Too early Board", type: GroupType.Board, organisationYear: "2055" }))
    ).toEqual({ status: "error", error: "organisation-year-too-far-ahead" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("the dedicated gig workflow fixes type and scope despite forged form fields", async () => {
    expect(
      await createGigGroupAction(
        IDLE,
        form({
          name: "Dedicated ensemble",
          type: GroupType.Board,
          choirId: await t.groupId("KK"),
          organisationYear: "2099"
        })
      )
    ).toMatchObject({ status: "success" })
    expect(await named("Dedicated ensemble")).toMatchObject({
      type: GroupType.GigGroup,
      choirId: null,
      organisationYear: null,
      active: true
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/gig-groups", "page")
  })

  test("creates, renames, archives, and passes typed policy failures through the action boundary", async () => {
    expect(await createGroupAction(IDLE, form({ name: " ", type: GroupType.GigGroup }))).toEqual({
      status: "error",
      error: "invalid-group-name"
    })
    expect(await createGroupAction(IDLE, form({ name: "Action gig", type: GroupType.GigGroup }))).toMatchObject({
      status: "success"
    })
    const row = await named("Action gig")
    if (!row) throw new Error("Expected the created Group.")
    expect(await renameGroupAction(IDLE, form({ groupId: row.id, name: "Renamed action gig" }))).toMatchObject({
      status: "success"
    })
    expect(await archiveGroupAction(IDLE, form({ groupId: row.id }))).toMatchObject({ status: "success" })
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
      (row) => row.type === GroupType.Archives && row.organisationYear === 2050
    )
    if (!archive) throw new Error("Expected the prepared Arkivarie Group.")
    const userId = await t.user()
    expect(
      await addDirectMemberAction(
        IDLE,
        form({ groupId: archive.id, userId, startDate: "2050-09-01", lastDay: "2051-06-30" })
      )
    ).toMatchObject({ status: "success" })
    expect(await listDirectMembersAt(t.db, archive.id, "2051-06-30")).toMatchObject([{ userId }])
    const [membership] = await listDirectMemberships(t.db, archive.id)
    if (!membership) throw new Error("Expected the direct Membership.")
    expect(
      await changeDirectMemberAction(
        IDLE,
        form({ membershipId: membership.id, groupId: archive.id, startDate: "2050-10-01", lastDay: "2051-06-30" })
      )
    ).toMatchObject({ status: "success" })
    const changed = (await listDirectMemberships(t.db, archive.id)).find((row) => row.startDate === "2050-10-01")
    expect(
      await correctDirectMemberAction(
        IDLE,
        form({
          membershipId: requireTestValue(changed, "corrected Membership").id,
          groupId: archive.id,
          startDate: "2050-10-01",
          lastDay: "2051-05-31"
        })
      )
    ).toMatchObject({ status: "success" })
    const directBeforeRefusal = await listDirectMemberships(t.db, archive.id)
    revalidatePath.mockClear()
    expect(
      await correctDirectMemberAction(
        IDLE,
        form({
          membershipId: requireTestValue(changed, "corrected Membership").id,
          groupId: archive.id,
          startDate: "2050-10-01",
          lastDay: "2051-07-01"
        })
      )
    ).toEqual({ status: "error", error: "period-conflict" })
    expect(await listDirectMemberships(t.db, archive.id)).toEqual(directBeforeRefusal)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(
      await editGroupAction(
        IDLE,
        form({ groupId: archive.id, name: "Bad year correction", type: GroupType.Archives, organisationYear: "2051" })
      )
    ).toEqual({ status: "error", error: "group-has-participation" })
    expect(
      await endDirectMemberAction(
        IDLE,
        form({ membershipId: requireTestValue(changed, "corrected Membership").id, lastDay: "2051-04-30" })
      )
    ).toMatchObject({ status: "success" })
    expect(
      await t.db
        .select()
        .from(directMembership)
        .where(eq(directMembership.id, requireTestValue(changed, "corrected Membership").id))
    ).toMatchObject([{ endDate: "2051-05-01" }])
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

  test("historical corrections offer archived sibling Sections but future corrections remain refused", async () => {
    setSystemTime(new Date("2026-10-22T12:00:00Z"))
    const { addDirectMembership } = await import("../direct-membership")
    const choirId = await t.groupId("KK")
    const sourceSection = await t.groupId("KKS")
    const archivedDestination = await t.groupId("KKB")
    const userId = await t.user("Historical placement")
    const membership = await addDirectMembership(t.db, {
      userId,
      groupId: sourceSection,
      voice: "S1",
      startDate: "2020-01-01",
      endDate: "2020-07-01"
    })
    expect(membership.success).toBe(true)
    if (!membership.success) return
    expect(await archiveGroupAction(IDLE, form({ groupId: choirId }))).toMatchObject({ status: "success" })
    const detail = await getGroupDetail(sourceSection, "2026-10-21")
    expect(detail?.placementSections).toHaveLength(4)
    expect(detail?.placementSections.find(({ id }) => id === archivedDestination)).toMatchObject({ active: false })
    expect(
      await correctDirectMemberAction(
        IDLE,
        form({
          membershipId: membership.data.id,
          groupId: archivedDestination,
          startDate: "2020-01-01",
          lastDay: "2020-06-30",
          voice: "B1"
        })
      )
    ).toMatchObject({ status: "success" })
    expect(await t.db.select().from(directMembership).where(eq(directMembership.id, membership.data.id))).toMatchObject(
      [{ groupId: archivedDestination, voice: "B1", startDate: "2020-01-01", endDate: "2020-07-01" }]
    )
    expect(
      await correctDirectMemberAction(
        IDLE,
        form({
          membershipId: membership.data.id,
          groupId: archivedDestination,
          startDate: "2027-01-01",
          lastDay: "2027-06-30",
          voice: "B1"
        })
      )
    ).toEqual({ status: "error", error: "group-archived" })
    expect(await t.db.select().from(directMembership).where(eq(directMembership.id, membership.data.id))).toMatchObject(
      [{ groupId: archivedDestination, voice: "B1", startDate: "2020-01-01", endDate: "2020-07-01" }]
    )
  })

  test("the Choir row departure action ends Section and team periods atomically and rolls back on a dependency", async () => {
    const { createOrganisationGroup } = await import("../appointments")
    const { addDirectMembership } = await import("../direct-membership")
    const first = await t.user("Choir departure")
    const choirId = await t.groupId("MK")
    const sectionId = await t.groupId("MKB1")
    const team = await createOrganisationGroup(
      t.db,
      { name: "KK team", type: GroupType.EquipmentTeam, choirId },
      "4000-10-22"
    )
    expect(team.success).toBe(true)
    if (!team.success) return
    const choirMembership = await addDirectMembership(t.db, {
      userId: first,
      groupId: choirId,
      startDate: "2024-08-01"
    })
    await addDirectMembership(t.db, { userId: first, groupId: sectionId, voice: "B1", startDate: "2024-08-01" })
    await addDirectMembership(t.db, { userId: first, groupId: team.data.id, startDate: "2024-08-01" })
    if (!choirMembership.success) throw new Error(choirMembership.error)
    expect(
      await endChoirMemberAction(
        IDLE,
        form({ membershipId: choirMembership.data.id, groupId: choirId, userId: first, lastDay: "2025-06-30" })
      )
    ).toMatchObject({ status: "success" })
    expect(await listDirectMembersAt(t.db, choirId, "2025-07-01")).toEqual([])
    expect(await listDirectMembersAt(t.db, sectionId, "2025-07-01")).toEqual([])
    expect(await listDirectMembersAt(t.db, team.data.id, "2025-07-01")).toEqual([])
    expect(
      await endChoirMemberAction(
        IDLE,
        form({ membershipId: choirMembership.data.id, groupId: choirId, userId: first, lastDay: "2025-06-30" })
      )
    ).toMatchObject({ status: "success" })
    expect(
      await endChoirMemberAction(
        IDLE,
        form({ membershipId: choirMembership.data.id, groupId: choirId, userId: first, lastDay: "2026-06-30" })
      )
    ).toEqual({ status: "error", error: "period-conflict" })
    expect(await listDirectMembersAt(t.db, choirId, "2025-07-01")).toEqual([])

    const second = await t.user("Protected singer")
    const protectedMembership = await addDirectMembership(t.db, {
      userId: second,
      groupId: choirId,
      startDate: "2024-08-01"
    })
    await addDirectMembership(t.db, { userId: second, groupId: sectionId, voice: "B1", startDate: "2024-08-01" })
    if (!protectedMembership.success) throw new Error(protectedMembership.error)
    const { appointPosition } = await import("../appointments")
    expect(
      await appointPosition(t.db, {
        userId: second,
        positionCode: PositionCode.Conductor,
        contextGroupId: choirId,
        startDate: "2024-08-01",
        endDate: null
      })
    ).toMatchObject({ success: true })
    expect(
      await endChoirMemberAction(
        IDLE,
        form({ membershipId: protectedMembership.data.id, groupId: choirId, userId: second, lastDay: "2025-06-30" })
      )
    ).toEqual({
      status: "error",
      error: "membership-dependency"
    })
    expect(await listDirectMembersAt(t.db, choirId, "2025-07-01")).toMatchObject([{ userId: second }])
    expect(await listDirectMembersAt(t.db, sectionId, "2025-07-01")).toMatchObject([{ userId: second }])
    expect(revalidatePath).toHaveBeenCalled()
  })

  test("replaces, corrects, ends, and cancels appointments through typed server actions", async () => {
    expect(await prepareYearAction(IDLE, form({ organisationYear: "2054" }))).toMatchObject({ status: "success" })
    const board = (await listOrganisationGroups(t.db, "2054-08-01")).find(
      (row) => row.type === GroupType.Board && row.organisationYear === 2054
    )
    if (!board) throw new Error("Expected the prepared Board.")
    const first = await t.user(),
      next = await t.user()
    const input = {
      positionCode: PositionCode.Chair,
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
    const currentMember = (await listAppointmentMembersAt(t.db, board.id, "2055-02-01"))[0]
    if (!currentMember?.appointments[0]) throw new Error("Expected the current appointment.")
    const current = currentMember.appointments[0]
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
      positionCode: PositionCode.ViceChair,
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
      (row) => row.type === GroupType.Board && row.organisationYear === 2024
    )
    if (!board) throw new Error("Expected the prepared Board.")
    const userId = await t.user()
    const appointment = await appointPosition(t.db, {
      userId,
      positionCode: PositionCode.Chair,
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

function requireTestValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${label} to exist.`)
  return value
}
