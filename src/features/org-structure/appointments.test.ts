import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { and, eq, sql } from "drizzle-orm"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import {
  appointPosition,
  createOrganisationGroup,
  endAppointment,
  listAppointmentMembersAt,
  listEffectiveMembersAt,
  listEffectiveMembersForGroupsAt,
  replaceAppointmentHolder
} from "./appointments"
import { addDirectMembership, endDirectMembership } from "./direct-membership"
import { listEffectiveParticipationOfUserAt } from "./effective-reads"
import {
  createOrgStructureTestDatabase,
  expectSuccess,
  type OrgStructureTestDatabase,
  uniqueName
} from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("appointment foundation", () => {
  let t: OrgStructureTestDatabase
  beforeAll(() => {
    t = database as OrgStructureTestDatabase
  })
  afterAll(async () => {
    await t.drop()
  })

  test("one September Sexmästare appointment grants both annual Groups for its single tenure", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 26/27", type: GroupType.Board, organisationYear: 2026 },
        "4000-10-22"
      )
    )
    const committee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Sexmästeriet 26/27",
          type: GroupType.SocialCommittee,
          organisationYear: 2026
        },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board.id,
        startDate: "2026-09-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, committee.id, "2026-08-31")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, committee.id, "2027-06-30")).toMatchObject([
      { userId, appointments: [{ id: appointment.id, contextGroupId: board.id, endDate: "2027-07-01" }] }
    ])
    expect(await listAppointmentMembersAt(t.db, board.id, "2027-07-01")).toEqual([])
  })

  test("a Board concert master stores one appointment and derives both memberships", async () => {
    const [board] = await t.db
      .select()
      .from(group)
      .where(and(eq(group.type, GroupType.Board), eq(group.organisationYear, 2026)))
    if (!board) throw new Error("Missing Board fixture")
    const committee = expectSuccess(
      await createOrganisationGroup(t.db, { type: GroupType.ConcertCommittee, organisationYear: 2026 }, "4000-10-22")
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.FirstConcertMaster,
        contextGroupId: board.id,
        startDate: "2026-09-01"
      })
    )
    expect(await t.db.select().from(positionAppointment).where(eq(positionAppointment.userId, userId))).toHaveLength(1)
    expect(await t.db.select().from(directMembership).where(eq(directMembership.userId, userId))).toEqual([])
    const participation = await listEffectiveParticipationOfUserAt(t.db, userId, "2026-10-22")
    expect(participation.groups.map(({ groupId }) => groupId).sort()).toEqual([board.id, committee.id].sort())
    expect(participation.positions).toMatchObject([
      {
        id: appointment.id,
        grantedGroups: expect.arrayContaining([
          { id: board.id, name: null, type: GroupType.Board, choirId: null, organisationYear: 2026 },
          { id: committee.id, name: null, type: GroupType.ConcertCommittee, choirId: null, organisationYear: 2026 }
        ])
      }
    ])
    await endAppointment(t.db, { appointmentId: appointment.id, endDate: "2026-11-01" })
    expect((await listEffectiveParticipationOfUserAt(t.db, userId, "2026-11-01")).groups).toEqual([])
    expect((await listEffectiveParticipationOfUserAt(t.db, userId, "2026-10-31")).groups).toHaveLength(2)
  })

  test("the batched effective roster read preserves one appointment across all granted Groups", async () => {
    const year = 3000 + Math.floor(Math.random() * 500)
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: uniqueName("Batched Board"),
          type: GroupType.Board,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const sex = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: uniqueName("Batched Sexmästeri"),
          type: GroupType.SocialCommittee,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board.id,
        startDate: `${year}-09-01`
      })
    )
    const batched = await listEffectiveMembersForGroupsAt(t.db, [board.id, sex.id], `${year}-10-01`)
    expect(batched.get(board.id)).toMatchObject([{ userId, positions: [{ id: appointment.id }] }])
    expect(batched.get(sex.id)).toMatchObject([{ userId, positions: [{ id: appointment.id }] }])
  })

  test("appointing a committee officer converts an overlapping Helper and preserves the earlier period", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 37/38 helper", type: GroupType.Board, organisationYear: 2037 },
        "4000-10-22"
      )
    )
    const committee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Sexmästeriet 37/38 helper",
          type: GroupType.SocialCommittee,
          organisationYear: 2037
        },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    await t.db.insert(directMembership).values({
      userId,
      groupId: committee.id,
      startDate: "2037-07-01",
      endDate: "2038-07-01"
    })
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board.id,
        startDate: "2037-09-15"
      })
    )
    const helper = await t.db.select().from(directMembership).where(eq(directMembership.groupId, committee.id))
    expect(helper).toMatchObject([{ startDate: "2037-07-01", endDate: "2037-09-15" }])
    expect(await listAppointmentMembersAt(t.db, committee.id, "2037-09-15")).toMatchObject([{ userId }])
  })

  test("concurrent handovers preserve the started appointment and allow one successor", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Board 38/39 handover",
          type: GroupType.Board,
          organisationYear: 2038
        },
        "4000-10-22"
      )
    )
    const incumbent = await t.user()
    expectSuccess(
      await appointPosition(t.db, {
        userId: incumbent,
        positionCode: PositionCode.Chair,
        contextGroupId: board.id,
        startDate: "2038-07-01"
      })
    )
    const boundary = "2038-10-01"
    const successors = [await t.user(), await t.user()]
    const results = await Promise.all(
      successors.map((userId) =>
        replaceAppointmentHolder(t.db, {
          userId,
          positionCode: PositionCode.Chair,
          contextGroupId: board.id,
          organisationYear: 2038,
          startDate: boundary
        })
      )
    )
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(await listAppointmentMembersAt(t.db, board.id, "2038-09-30")).toMatchObject([{ userId: incumbent }])
    expect(await listAppointmentMembersAt(t.db, board.id, boundary)).toHaveLength(1)
  })

  test("concurrent future assignments have one winner and return a typed occupancy refusal", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 27/28", type: GroupType.Board, organisationYear: 2027 },
        "4000-10-22"
      )
    )
    const results = await Promise.all(
      [await t.user(), await t.user()].map((userId) =>
        appointPosition(t.db, {
          userId,
          positionCode: PositionCode.Chair,
          contextGroupId: board.id,
          startDate: "2027-09-01",
          endDate: "2028-01-01"
        })
      )
    )
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "position-taken" })
    expect(await listAppointmentMembersAt(t.db, board.id, "2027-09-01")).toHaveLength(1)
  })

  test("a refusal inside a caller transaction preserves its savepoint and leaves no partial appointment", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 28/29", type: GroupType.Board, organisationYear: 2028 },
        "4000-10-22"
      )
    )
    await t.db.transaction(async (tx) => {
      expect(
        await appointPosition(tx, {
          userId: await t.user(),
          positionCode: PositionCode.SocialCoordinator,
          contextGroupId: board.id,
          startDate: "2028-07-01"
        })
      ).toEqual({ success: false, error: "group-not-found" })
      expect(await listAppointmentMembersAt(tx, board.id, "2028-07-01")).toEqual([])
      expectSuccess(
        await appointPosition(tx, {
          userId: await t.user(),
          positionCode: PositionCode.Chair,
          contextGroupId: board.id,
          startDate: "2028-07-01",
          endDate: "2029-01-01"
        })
      )
    })
    expect(
      await t.db.select().from(positionAppointment).where(eq(positionAppointment.contextGroupId, board.id))
    ).toHaveLength(1)
  })

  test("future non-overlapping tenures allow a vacancy and exact-boundary succession", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 29/30", type: GroupType.Board, organisationYear: 2029 },
        "4000-10-22"
      )
    )
    const first = await t.user()
    const second = await t.user()
    expectSuccess(
      await appointPosition(t.db, {
        userId: first,
        positionCode: PositionCode.Chair,
        contextGroupId: board.id,
        startDate: "2029-09-01",
        endDate: "2030-01-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: second,
        positionCode: PositionCode.Chair,
        contextGroupId: board.id,
        startDate: "2030-01-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, board.id, "2029-08-31")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, board.id, "2029-12-31")).toMatchObject([{ userId: first }])
    expect(await listAppointmentMembersAt(t.db, board.id, "2030-01-01")).toMatchObject([{ userId: second }])
  })

  test("racing different Board Positions for one person permits only one", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 30/31", type: GroupType.Board, organisationYear: 2030 },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    const results = await Promise.all(
      ([PositionCode.Chair, PositionCode.Treasurer] as const).map((positionCode) =>
        appointPosition(t.db, { userId, positionCode, contextGroupId: board.id, startDate: "2030-07-01" })
      )
    )
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "already-holding-elected-post" })
  })

  test("same-title representatives from independent Choir contexts share one committee", async () => {
    const committee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Konsertmästeriet 31/32",
          type: GroupType.ConcertCommittee,
          organisationYear: 2031
        },
        "4000-10-22"
      )
    )
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 31/32", type: GroupType.Board, organisationYear: 2031 },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    for (const choir of ["MK", "DK", "KK"]) {
      const contextGroupId = await t.groupId(choir)
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: contextGroupId, startDate: "2031-07-01" }))
      expectSuccess(
        await appointPosition(t.db, {
          userId,
          positionCode: PositionCode.ChoirConcertMaster,
          contextGroupId,
          organisationYear: 2031,
          startDate: "2031-09-01"
        })
      )
    }
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user(),
        positionCode: PositionCode.FirstConcertMaster,
        contextGroupId: board.id,
        startDate: "2031-07-01"
      })
    )
    const members = await listAppointmentMembersAt(t.db, committee.id, "2031-10-01")
    expect(members).toHaveLength(2)
    expect(members.find((member) => member.userId === userId)?.appointments).toHaveLength(3)
    const effective = await listEffectiveMembersAt(t.db, committee.id, "2031-10-01")
    expect(effective).toHaveLength(2)
    expect(effective.find((member) => member.userId === userId)?.positions).toHaveLength(3)
    expect(
      effective.find((member) => member.userId === userId)?.positions.map(({ contextName }) => contextName)
    ).toEqual(["DK", "KK", "MK"])
  })

  test("Choir Gigmästare share annual Gigmästeri with the separate CSK office", async () => {
    const gigCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Gig 47/48 reps",
          type: GroupType.GigCommittee,
          organisationYear: 2047
        },
        "4000-10-22"
      )
    )
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 47/48 gig", type: GroupType.Board, organisationYear: 2047 },
        "4000-10-22"
      )
    )
    for (const choirName of ["MK", "DK", "KK"]) {
      const userId = await t.user(`${choirName} representative`)
      const choirId = await t.groupId(choirName)
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2047-07-01" }))
      expectSuccess(
        await appointPosition(t.db, {
          userId,
          positionCode: PositionCode.ChoirGigCoordinator,
          contextGroupId: choirId,
          organisationYear: 2047,
          startDate: "2047-09-01"
        })
      )
    }
    const cskHolder = await t.user("CSK Gigmästare")
    expectSuccess(
      await appointPosition(t.db, {
        userId: cskHolder,
        positionCode: PositionCode.OrganisationGigCoordinator,
        contextGroupId: board.id,
        startDate: "2047-07-01"
      })
    )
    const roster = await listEffectiveMembersAt(t.db, gigCommittee.id, "2047-09-01")
    expect(roster).toHaveLength(4)
    expect(roster.map(({ positions }) => positions[0]?.positionCode).sort()).toEqual([
      PositionCode.ChoirGigCoordinator,
      PositionCode.ChoirGigCoordinator,
      PositionCode.ChoirGigCoordinator,
      PositionCode.OrganisationGigCoordinator
    ])
  })

  test("direct Choir Membership remains prerequisite evidence for a Choir appointment", async () => {
    const choirId = await t.groupId("KK")
    const userId = await t.user("Legacy singer")
    expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2048-07-01" }))
    const gigCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Gig 48/49", type: GroupType.GigCommittee, organisationYear: 2048 },
        "4000-10-22"
      )
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.ChoirGigCoordinator,
        contextGroupId: choirId,
        organisationYear: 2048,
        startDate: "2048-09-01"
      })
    )
    expect(await listEffectiveMembersAt(t.db, gigCommittee.id, "2048-09-01")).toMatchObject([{ userId }])
  })

  test("representative handover and explicit renewal preserve each dated annual roster", async () => {
    const choirId = await t.groupId("MK")
    const firstCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Konsert 49/50 lifecycle",
          type: GroupType.ConcertCommittee,
          organisationYear: 2049
        },
        "4000-10-22"
      )
    )
    const nextCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Konsert 50/51 lifecycle",
          type: GroupType.ConcertCommittee,
          organisationYear: 2050
        },
        "4000-10-22"
      )
    )
    const incumbent = await t.user("Choir incumbent")
    const successor = await t.user("Choir successor")
    for (const userId of [incumbent, successor])
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2049-07-01" }))
    expectSuccess(
      await appointPosition(t.db, {
        userId: incumbent,
        positionCode: PositionCode.ChoirConcertMaster,
        contextGroupId: choirId,
        organisationYear: 2049,
        startDate: "2049-07-01"
      })
    )
    expectSuccess(
      await replaceAppointmentHolder(t.db, {
        userId: successor,
        positionCode: PositionCode.ChoirConcertMaster,
        contextGroupId: choirId,
        organisationYear: 2049,
        startDate: "2049-11-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: successor,
        positionCode: PositionCode.ChoirConcertMaster,
        contextGroupId: choirId,
        organisationYear: 2050,
        startDate: "2050-07-01"
      })
    )
    expect(await listEffectiveMembersAt(t.db, firstCommittee.id, "2049-10-31")).toMatchObject([{ userId: incumbent }])
    expect(await listEffectiveMembersAt(t.db, firstCommittee.id, "2049-11-01")).toMatchObject([{ userId: successor }])
    expect(await listEffectiveMembersAt(t.db, firstCommittee.id, "2050-07-01")).toMatchObject([])
    expect(await listEffectiveMembersAt(t.db, nextCommittee.id, "2050-07-01")).toMatchObject([{ userId: successor }])
  })

  test("annual and scoped singleton identities are enforced independently of editable names", async () => {
    const results = await Promise.all(
      ["A", "B"].map((name) =>
        createOrganisationGroup(t.db, { name, type: GroupType.Board, organisationYear: 2032 }, "4000-10-22")
      )
    )
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "group-name-taken" })
    expectSuccess(
      await createOrganisationGroup(t.db, { name: "Parents", type: GroupType.ParentsMeeting }, "4000-10-22")
    )
    expect(
      await createOrganisationGroup(t.db, { name: "Other parents", type: GroupType.ParentsMeeting }, "4000-10-22")
    ).toEqual({
      success: false,
      error: "group-name-taken"
    })
    const choirId = await t.groupId("MK")
    expectSuccess(
      await createOrganisationGroup(t.db, { name: "MK rodd", type: GroupType.EquipmentTeam, choirId }, "4000-10-22")
    )
    expect(
      await createOrganisationGroup(
        t.db,
        { name: "MK other rodd", type: GroupType.EquipmentTeam, choirId },
        "4000-10-22"
      )
    ).toEqual({
      success: false,
      error: "group-type-taken"
    })
    expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "DK rodd",
          type: GroupType.EquipmentTeam,
          choirId: await t.groupId("DK")
        },
        "4000-10-22"
      )
    )
    for (const name of ["Gig A", "Gig B"])
      expectSuccess(await createOrganisationGroup(t.db, { name, type: GroupType.GigGroup }, "4000-10-22"))
  })

  test("Dirigent, Notfiskal, and Gigledare stay fluid and ending Gigledare preserves direct Membership", async () => {
    const choir = await t.groupId("MK")
    const singer = await t.user()
    expectSuccess(await addDirectMembership(t.db, { userId: singer, groupId: choir, startDate: "2054-06-01" }))
    const dirigent = expectSuccess(
      await appointPosition(t.db, {
        userId: singer,
        positionCode: PositionCode.Conductor,
        contextGroupId: choir,
        startDate: "2054-06-15"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: singer,
        positionCode: PositionCode.MusicLibrarian,
        contextGroupId: choir,
        startDate: "2054-06-15"
      })
    )
    expect(await listAppointmentMembersAt(t.db, choir, "2054-07-01")).toEqual([])
    expect(await endAppointment(t.db, { appointmentId: dirigent.id, endDate: "2054-08-01" })).toEqual({
      success: true,
      data: { id: dirigent.id }
    })

    const gigGroup = expectSuccess(
      await createOrganisationGroup(t.db, { name: uniqueName("Gig"), type: GroupType.GigGroup }, "4000-10-22")
    )
    const gigSinger = await t.user()
    expectSuccess(await addDirectMembership(t.db, { userId: gigSinger, groupId: gigGroup.id, startDate: "2054-01-01" }))
    const leader = expectSuccess(
      await appointPosition(t.db, {
        userId: gigSinger,
        positionCode: PositionCode.GigLeader,
        contextGroupId: gigGroup.id,
        startDate: "2054-06-15"
      })
    )
    expect(await listAppointmentMembersAt(t.db, gigGroup.id, "2054-07-01")).toEqual([])
    const [gigMembership] = await t.db
      .select({ id: directMembership.id })
      .from(directMembership)
      .where(and(eq(directMembership.userId, gigSinger), eq(directMembership.groupId, gigGroup.id)))
    expect(await endDirectMembership(t.db, { membershipId: gigMembership.id, endDate: "2054-08-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(await endAppointment(t.db, { appointmentId: leader.id, endDate: "2054-08-01" })).toMatchObject({
      success: true
    })
    const [membershipAfterLeadership] = await t.db
      .select()
      .from(directMembership)
      .where(and(eq(directMembership.userId, gigSinger), eq(directMembership.groupId, gigGroup.id)))
    expect(membershipAfterLeadership).toMatchObject({ startDate: "2054-01-01", endDate: null })
    expect(await endDirectMembership(t.db, { membershipId: gigMembership.id, endDate: "2054-08-01" })).toMatchObject({
      success: true
    })
  })

  test("storage refuses wrong scope and annual bounds; derived memberships cannot cross years", async () => {
    await expect(
      t.db
        .insert(group)
        .values({ name: "Bad scope", type: GroupType.GigGroup, choirId: await t.groupId("MK") })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_organisation_policy_check" } })
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 33/34", type: GroupType.Board, organisationYear: 2033 },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    await expect(
      t.db
        .insert(positionAppointment)
        .values({
          userId,
          positionCode: PositionCode.Chair,
          contextGroupId: board.id,
          organisationYear: 2033,
          startDate: "2033-07-01",
          endDate: "2034-07-02"
        })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "position_appointment_annual_check" } })
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Chair,
        contextGroupId: board.id,
        startDate: "2033-07-01"
      })
    )
    const otherBoard = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 34/35", type: GroupType.Board, organisationYear: 2034 },
        "4000-10-22"
      )
    )
    expect(await listAppointmentMembersAt(t.db, otherBoard.id, "2034-08-01")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, board.id, "2033-08-01")).toMatchObject([
      { userId, appointments: [{ id: appointment.id }] }
    ])
    expect(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Treasurer,
        contextGroupId: board.id,
        startDate: "2033-02-31"
      })
    ).toEqual({ success: false, error: "invalid-date" })
  })

  test("direct participation is separately dated, Voice checked, and protected against overlaps", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Archive 35/36", type: GroupType.Archives, organisationYear: 2035 },
        "4000-10-22"
      )
    ).id
    const userId = await t.user()
    await t.db.insert(directMembership).values({ userId, groupId, startDate: "2035-09-01", endDate: "2036-07-01" })
    await expect(
      t.db
        .insert(directMembership)
        .values({ userId, groupId, startDate: "2035-10-01", endDate: "2036-01-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "direct_membership_overlap_excl" } })
    await expect(
      t.db
        .insert(directMembership)
        .values({ userId: await t.user(), groupId, startDate: "2035-07-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "direct_membership_annual_check" } })
    await expect(
      t.db
        .insert(directMembership)
        .values({ userId, groupId: await t.groupId("KKB"), startDate: "2035-07-01", voice: "T1" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "direct_membership_voice_check" } })
    await t.db
      .insert(directMembership)
      .values({ userId, groupId: await t.groupId("KKB"), startDate: "2035-07-01", voice: "B2" })
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Board 35/36", type: GroupType.Board, organisationYear: 2035 },
        "4000-10-22"
      )
    )
    await expect(
      t.db
        .insert(directMembership)
        .values({ userId, groupId: board.id, startDate: "2035-07-01", endDate: "2036-07-01" })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "direct_membership_policy_check" } })
    expect(
      await appointPosition(t.db, {
        userId: await t.user(),
        positionCode: PositionCode.Conductor,
        contextGroupId: await t.groupId("MK"),
        startDate: "2035-07-01"
      })
    ).toEqual({ success: false, error: "not-a-member" })
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`)
      expect(await listAppointmentMembersAt(tx, groupId, "2035-10-01")).toEqual([])
    })
  })
  test("continuous prerequisite periods cover one fluid appointment, while a one-day gap is refused", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Continuous gig membership", type: GroupType.GigGroup }, "4000-10-22")
    ).id
    const userId = await t.user()
    await t.db.insert(directMembership).values([
      { userId, groupId, startDate: "2038-07-01", endDate: "2039-01-01" },
      { userId, groupId, startDate: "2039-01-01", endDate: null }
    ])
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.GigLeader,
        contextGroupId: groupId,
        startDate: "2038-09-01"
      })
    )
    const otherUser = await t.user()
    await t.db.insert(directMembership).values([
      { userId: otherUser, groupId, startDate: "2038-07-01", endDate: "2039-01-01" },
      { userId: otherUser, groupId, startDate: "2039-01-02", endDate: null }
    ])
    expect(
      await appointPosition(t.db, {
        userId: otherUser,
        positionCode: PositionCode.GigLeader,
        contextGroupId: groupId,
        startDate: "2038-09-01"
      })
    ).toEqual({ success: false, error: "not-a-member" })
  })
})
