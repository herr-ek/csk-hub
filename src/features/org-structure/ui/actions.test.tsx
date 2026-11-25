import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import * as authz from "@/core/authz"
import { directMembership, group } from "@/core/db/schema/org-structure"
import * as intlServer from "@/core/i18n/server"
import { GroupType, organisationYearPeriod, PositionCode } from "@/core/org-structure"
import { createOrgStructureTestDatabase, expectSuccess } from "../test-support"

const database = await createOrgStructureTestDatabase()
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const revalidatePath = mock(() => undefined)
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/authz", () => ({ ...authz, requirePermission: requireAdmin }))
mock.module("next/cache", () => ({ revalidatePath }))
mock.module("@/core/i18n/server", () => ({ ...intlServer, getTranslations: async () => (key: string) => key }))

const { addMembersAction, archiveGroupAction, createOtherGroupAction, removeMemberAction, renameGroupAction } =
  await import("./committees/actions")
const { createGigGroupAction, refillGigGroupAction } = await import("./gig-groups/actions")
const { changeVoiceAction, leaveChoirAction, placeSingerAction } = await import("./choirs/actions")
const { fillPositionAction, vacatePositionAction } = await import("./positions/actions")
const { getGroupDetail } = await import("./history/query")
const {
  assignAppointmentAction,
  replaceAppointmentAction,
  correctAppointmentAction,
  endAppointmentAction,
  cancelAppointmentAction
} = await import("./history/appointment-actions")
const {
  addDirectMemberAction,
  correctDirectMemberAction,
  changeDirectMemberAction,
  endDirectMemberAction,
  endChoirMemberAction
} = await import("./history/direct-actions")
const {
  appointPosition,
  createOrganisationGroup,
  listAppointmentMembersAt,
  listAppointmentsOfUser,
  listEffectiveMembersAt
} = await import("../appointments")
const { listDirectMembersAt, listDirectMemberships } = await import("../direct-membership")
const { listOrganisationGroups, prepareOrganisationYear } = await import("../group-management")
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
      createOtherGroupAction,
      createGigGroupAction,
      refillGigGroupAction,
      renameGroupAction,
      archiveGroupAction,
      addMembersAction,
      removeMemberAction,
      fillPositionAction,
      vacatePositionAction,
      placeSingerAction,
      leaveChoirAction,
      addDirectMemberAction,
      correctDirectMemberAction,
      changeDirectMemberAction,
      endDirectMemberAction,
      endChoirMemberAction,
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
    const userId = await t.user()
    expect(
      await fillPositionAction(
        IDLE,
        form({ userId, positionCode: PositionCode.Chair, organisationYear: "2055", startDate: "2055-07-01" })
      )
    ).toEqual({ status: "error", error: "organisation-year-too-far-ahead" })
    expect(
      await addMembersAction(
        IDLE,
        form({ type: GroupType.Archives, organisationYear: "2055", userIds: userId, startDate: "2055-07-01" })
      )
    ).toEqual({ status: "error", error: "organisation-year-too-far-ahead" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test("plans, swaps and clears a holder, and vacates one who has begun", async () => {
    const [first, second] = [await t.user(), await t.user()]
    const board = (userId: string, extra: Record<string, string> = {}) =>
      fillPositionAction(
        IDLE,
        form({
          userId,
          positionCode: PositionCode.Treasurer,
          organisationYear: "2054",
          startDate: "2054-07-01",
          ...extra
        })
      )
    expect(await board(first)).toMatchObject({ status: "success" })
    expect(await board(second)).toEqual({ status: "error", error: "period-conflict" })
    const [planned] = await listAppointmentsOfUser(t.db, first)
    if (!planned) throw new Error("Expected the planned holder.")
    expect(await board(second, { replaces: planned.id })).toMatchObject({ status: "success" })
    const [swapped] = await listAppointmentsOfUser(t.db, second)
    if (!swapped) throw new Error("Expected the swapped holder.")
    expect(await vacatePositionAction(IDLE, form({ appointmentId: swapped.id }))).toMatchObject({ status: "success" })
    expect(await listAppointmentsOfUser(t.db, second)).toEqual([])

    const current = { organisationYear: "2053", startDate: "2053-08-01" }
    expect(await board(first, current)).toMatchObject({ status: "success" })
    const [held] = await listAppointmentsOfUser(t.db, first)
    if (!held) throw new Error("Expected the current holder.")
    expect(await vacatePositionAction(IDLE, form({ appointmentId: held.id }))).toEqual({
      status: "error",
      error: "period-conflict"
    })
    expect(await vacatePositionAction(IDLE, form({ appointmentId: held.id, lastDay: "2053-10-22" }))).toMatchObject({
      status: "success"
    })
    expect(await listAppointmentsOfUser(t.db, first)).toMatchObject([{ endDate: "2053-10-23" }])
  })

  test("adds several members at once and takes one out", async () => {
    const [first, second] = [await t.user(), await t.user()]
    expect(
      await addMembersAction(
        IDLE,
        form({ type: GroupType.WebTeam, organisationYear: "2053", userIds: [first, second], startDate: "2053-10-22" })
      )
    ).toMatchObject({ status: "success" })
    const [team] = await t.db
      .select()
      .from(group)
      .where(and(eq(group.type, GroupType.WebTeam), eq(group.organisationYear, 2053)))
    if (!team) throw new Error("Expected the year's Group.")
    const memberships = await listDirectMemberships(t.db, team.id)
    expect(memberships.map(({ userId }) => userId).sort()).toEqual([first, second].sort())
    expect(
      await removeMemberAction(IDLE, form({ membershipId: requireTestValue(memberships[0], "Membership").id }))
    ).toMatchObject({ status: "success" })
    expect(await listDirectMemberships(t.db, team.id)).toHaveLength(1)
    expect(await addMembersAction(IDLE, form({ userIds: first, startDate: "2053-10-22" }))).toEqual({
      status: "error",
      error: "invalid-input"
    })
  })

  test("a refill parses its leavers, Voices and joiners", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Refilled ensemble", type: GroupType.GigGroup })
    ).id
    const [leaver, joiner] = [await t.singer("S1", "S2"), await t.singer("A1")]
    const joined = await refillGigGroupAction(
      IDLE,
      form({ groupId, date: "2053-01-10", join: [`S1:${leaver}`, `A1:${joiner}`] })
    )
    expect(joined).toMatchObject({ status: "success" })
    const [membership] = (await listDirectMemberships(t.db, groupId)).filter(({ userId }) => userId === leaver)
    const id = requireTestValue(membership, "Membership").id
    expect(await refillGigGroupAction(IDLE, form({ groupId, date: "2053-10-22", voices: `S2:${id}` }))).toMatchObject({
      status: "success"
    })
    expect(await refillGigGroupAction(IDLE, form({ groupId, date: "2053-10-22", leave: id }))).toMatchObject({
      status: "success"
    })
    expect(await listDirectMembersAt(t.db, groupId, "2053-10-22")).toMatchObject([{ userId: joiner, voice: "A1" }])
    expect(await refillGigGroupAction(IDLE, form({ groupId, date: "2053-10-22", join: "B:someone" }))).toEqual({
      status: "error",
      error: "invalid-input"
    })
  })

  test("refuses direct Board membership", async () => {
    const year = 2052
    expectSuccess(await createOrganisationGroup(t.db, { type: GroupType.Board, organisationYear: year }, "2053-10-22"))
    const [board] = await t.db
      .select()
      .from(group)
      .where(and(eq(group.type, GroupType.Board), eq(group.organisationYear, year)))
    if (!board) throw new Error("Missing Board")
    expect(board.name).toBeNull()
    expect(
      await addDirectMemberAction(
        IDLE,
        form({ groupId: board.id, userId: await t.user(), startDate: organisationYearPeriod(year).startDate })
      )
    ).toEqual({ status: "error", error: "direct-membership-forbidden" })
    expect(await t.db.select().from(directMembership).where(eq(directMembership.groupId, board.id))).toEqual([])
  })

  test("gig additions require a Voice without changing Section participation", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, {
        name: "Gig Voice action",
        type: GroupType.GigGroup
      })
    ).id
    const userId = await t.singer("B1")
    const sectionId = await t.groupId("KKB")
    expect(
      await placeSingerAction(
        IDLE,
        form({ choirId: await t.groupId("KK"), userId, voice: "B2", startDate: "2026-08-01" })
      )
    ).toMatchObject({ status: "success" })
    expect(await addDirectMemberAction(IDLE, form({ groupId, userId, startDate: "2026-09-01" }))).toEqual({
      status: "error",
      error: "invalid-membership-voice"
    })
    expect(
      await addDirectMemberAction(IDLE, form({ groupId, userId, voice: "B1", startDate: "2026-09-01" }))
    ).toMatchObject({
      status: "success"
    })
    expect(await listEffectiveMembersAt(t.db, groupId, "2026-10-01")).toMatchObject([{ userId, voice: "B1" }])
    expect(await listEffectiveMembersAt(t.db, sectionId, "2026-10-01")).toMatchObject([{ userId, voice: "B2" }])
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
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/(app)/admin", "layout")
  })

  test("creates, renames, archives, and passes typed policy failures through the action boundary", async () => {
    expect(await createOtherGroupAction(IDLE, form({ name: " " }))).toEqual({
      status: "error",
      error: "invalid-input"
    })
    expect(await createOtherGroupAction(IDLE, form({ name: "Action group", type: GroupType.Board }))).toMatchObject({
      status: "success"
    })
    const row = await named("Action group")
    expect(row).toMatchObject({ type: GroupType.Other, choirId: null, organisationYear: null })
    if (!row) throw new Error("Expected the created Group.")
    expect(await renameGroupAction(IDLE, form({ groupId: row.id, name: "Renamed action group" }))).toMatchObject({
      status: "success"
    })
    expect(await archiveGroupAction(IDLE, form({ groupId: row.id }))).toMatchObject({ status: "success" })
    expect((await named("Renamed action group"))?.active).toBe(false)
    expect(await archiveGroupAction(IDLE, form({ groupId: await t.groupId("KKB") }))).toEqual({
      status: "error",
      error: "section-archived-with-choir"
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  test("applies inclusive dates to direct membership actions", async () => {
    expectSuccess(await prepareOrganisationYear(t.db, 2050))
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

  test("singers are placed, change Voice and leave; ending a Position must be acknowledged", async () => {
    const userId = await t.user()
    const sectionId = await t.groupId("KKB")
    const choirId = await t.groupId("KK")
    const place = (user: string, voice: string, choir: string) =>
      placeSingerAction(IDLE, form({ choirId: choir, userId: user, voice, startDate: "2024-08-01" }))
    expect(await place(userId, "B2", choirId)).toMatchObject({ status: "success" })
    expect(await place(await t.user(), "S1", await t.groupId("MK"))).toEqual({
      status: "error",
      error: "voice-not-sung-in-choir"
    })
    expect(
      await changeVoiceAction(IDLE, form({ choirId, userId, voice: "B1", startDate: "2025-01-01" }))
    ).toMatchObject({ status: "success" })
    expectSuccess(await createOrganisationGroup(t.db, { type: GroupType.ParentsMeeting }))
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.SectionParent,
        contextGroupId: sectionId,
        startDate: "2025-02-01"
      })
    )
    const leave = { choirId, userId, lastDay: "2025-06-01" }
    expect(await leaveChoirAction(IDLE, form(leave))).toEqual({ status: "error", error: "membership-dependency" })
    expect(await leaveChoirAction(IDLE, form({ ...leave, endAppointments: "true" }))).toMatchObject({
      status: "success"
    })
    expect(await listDirectMembersAt(t.db, choirId, "2025-06-01")).toMatchObject([{ userId }])
    expect(await listDirectMembersAt(t.db, choirId, "2025-06-02")).toEqual([])
    expect(await listDirectMembersAt(t.db, sectionId, "2025-06-02")).toEqual([])
    expect(await listAppointmentsOfUser(t.db, userId)).toMatchObject([{ endDate: "2025-06-02" }])
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
    expectSuccess(await prepareOrganisationYear(t.db, 2054))
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
    expectSuccess(await prepareOrganisationYear(t.db, 2024))
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
