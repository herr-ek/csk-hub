import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { and, eq, sql } from "drizzle-orm"
import { appointmentGrant, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import {
  appointPosition,
  correctAnnualAppointment,
  correctFluidAppointment,
  createOrganisationGroup,
  endAppointment,
  listAppointmentMembersAt,
  listAppointmentsForGroup,
  listEffectiveMembersAt,
  listEffectiveMembersForGroupsAt,
  replaceAppointmentHolder
} from "./appointments"
import { addDirectMembership, endDirectMembership, listDirectMembersAt } from "./direct-membership"
import { updateOrganisationGroup } from "./group-management"
import { archiveGroup } from "./structure"
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
          type: GroupType.Sexmästeri,
          organisationYear: 2026
        },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Sexmastare,
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
          type: GroupType.Sexmästeri,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Sexmastare,
        contextGroupId: board.id,
        startDate: `${year}-09-01`
      })
    )
    const batched = await listEffectiveMembersForGroupsAt(t.db, [board.id, sex.id], `${year}-10-01`)
    expect(batched.get(board.id)).toMatchObject([{ userId, positions: [{ id: appointment.id }] }])
    expect(batched.get(sex.id)).toMatchObject([{ userId, positions: [{ id: appointment.id }] }])
  })

  test("completed annual appointments and archived Groups remain correctable and identifiable", async () => {
    const year = new Date().getUTCFullYear() - 3 - Math.floor(Math.random() * 5)
    const board = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: uniqueName(`Historical Board ${year}`),
          type: GroupType.Board,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const committee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: uniqueName(`Historical Sex ${year}`),
          type: GroupType.Sexmästeri,
          organisationYear: year
        },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Sexmastare,
        contextGroupId: board.id,
        startDate: `${year}-09-01`
      })
    )
    expectSuccess(await archiveGroup(t.db, board.id))
    expectSuccess(await archiveGroup(t.db, committee.id))

    expect(
      await correctAnnualAppointment(t.db, {
        appointmentId: appointment.id,
        userId,
        positionCode: PositionCode.Sexmastare,
        contextGroupId: board.id,
        organisationYear: year,
        startDate: `${year}-10-01`,
        endDate: `${year + 1}-07-01`
      })
    ).toEqual({ success: true, data: { id: appointment.id } })
    expect(await listAppointmentsForGroup(t.db, board.id)).toMatchObject([
      { id: appointment.id, contextGroupId: board.id, startDate: `${year}-10-01` }
    ])
    expect(
      await updateOrganisationGroup(
        t.db,
        {
          groupId: board.id,
          name: uniqueName(`Renamed historical Board ${year}`),
          type: GroupType.Board,
          organisationYear: year
        },
        "4000-10-22"
      )
    ).toEqual({ success: true, data: { id: board.id } })
    expect(
      await updateOrganisationGroup(
        t.db,
        {
          groupId: board.id,
          name: uniqueName(`Moved historical Board ${year}`),
          type: GroupType.Board,
          organisationYear: year + 1
        },
        "4000-10-22"
      )
    ).toEqual({ success: false, error: "group-archived" })
  })

  test("archived fluid Groups allow ended corrections but refuse current or future participation", async () => {
    const gigGroup = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: uniqueName("Historical GigGroup"), type: GroupType.GigGroup },
        "4000-10-22"
      )
    )
    const userId = await t.user()
    expectSuccess(
      await addDirectMembership(t.db, {
        userId,
        groupId: gigGroup.id,
        startDate: "2020-01-01",
        endDate: "2020-03-01"
      })
    )
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Gigledare,
        contextGroupId: gigGroup.id,
        startDate: "2020-01-01",
        endDate: "2020-03-01"
      })
    )
    expectSuccess(await archiveGroup(t.db, gigGroup.id))

    expect(
      await correctFluidAppointment(t.db, {
        appointmentId: appointment.id,
        userId,
        positionCode: PositionCode.Gigledare,
        contextGroupId: gigGroup.id,
        startDate: "2020-01-02",
        endDate: "2020-03-01"
      })
    ).toEqual({ success: true, data: { id: appointment.id } })
    expect(
      await correctFluidAppointment(t.db, {
        appointmentId: appointment.id,
        userId,
        positionCode: PositionCode.Gigledare,
        contextGroupId: gigGroup.id,
        startDate: "2020-01-02",
        endDate: "2028-03-01"
      })
    ).toEqual({ success: false, error: "group-archived" })
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
          type: GroupType.Sexmästeri,
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
        positionCode: PositionCode.Sexmastare,
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
        positionCode: PositionCode.Ordforande,
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
          positionCode: PositionCode.Ordforande,
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

  test("correcting a Board appointment moves holder, year, and companion grant together", async () => {
    const boardA = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Board 39/40 correction",
          type: GroupType.Board,
          organisationYear: 2039
        },
        "4000-10-22"
      )
    )
    const sexA = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Sex 39/40 correction",
          type: GroupType.Sexmästeri,
          organisationYear: 2039
        },
        "4000-10-22"
      )
    )
    const boardB = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Board 40/41 correction",
          type: GroupType.Board,
          organisationYear: 2040
        },
        "4000-10-22"
      )
    )
    const sexB = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Sex 40/41 correction",
          type: GroupType.Sexmästeri,
          organisationYear: 2040
        },
        "4000-10-22"
      )
    )
    const first = await t.user()
    const corrected = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId: first,
        positionCode: PositionCode.Sexmastare,
        contextGroupId: boardA.id,
        startDate: "2039-07-01"
      })
    )
    expectSuccess(
      await correctAnnualAppointment(t.db, {
        appointmentId: appointment.id,
        userId: corrected,
        positionCode: PositionCode.Sexmastare,
        contextGroupId: boardB.id,
        organisationYear: 2040,
        startDate: "2040-08-01",
        endDate: "2041-07-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, boardA.id, "2039-08-01")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, sexA.id, "2039-08-01")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, boardB.id, "2040-08-01")).toMatchObject([{ userId: corrected }])
    expect(await listAppointmentMembersAt(t.db, sexB.id, "2040-08-01")).toMatchObject([{ userId: corrected }])
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
          positionCode: PositionCode.Ordforande,
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
          positionCode: PositionCode.Sexmastare,
          contextGroupId: board.id,
          startDate: "2028-07-01"
        })
      ).toEqual({ success: false, error: "group-not-found" })
      expect(await listAppointmentMembersAt(tx, board.id, "2028-07-01")).toEqual([])
      expectSuccess(
        await appointPosition(tx, {
          userId: await t.user(),
          positionCode: PositionCode.Ordforande,
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
        positionCode: PositionCode.Ordforande,
        contextGroupId: board.id,
        startDate: "2029-09-01",
        endDate: "2030-01-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: second,
        positionCode: PositionCode.Ordforande,
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
      ([PositionCode.Ordforande, PositionCode.Kassor] as const).map((positionCode) =>
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
          type: GroupType.Konsertmästeri,
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
          positionCode: PositionCode.ChoirKonsertmastare,
          contextGroupId,
          organisationYear: 2031,
          startDate: "2031-09-01"
        })
      )
    }
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user(),
        positionCode: PositionCode.ForstaKonsertmastare,
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

  test("Choir representative corrections retain prerequisite eligibility and move every annual grant", async () => {
    const oldCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Konsert 45/46 reps",
          type: GroupType.Konsertmästeri,
          organisationYear: 2045
        },
        "4000-10-22"
      )
    )
    const nextCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Konsert 46/47 reps",
          type: GroupType.Konsertmästeri,
          organisationYear: 2046
        },
        "4000-10-22"
      )
    )
    const choir = await t.groupId("MK")
    const original = await t.user("Original")
    const corrected = await t.user("Corrected")
    const originalMembership = expectSuccess(
      await addDirectMembership(t.db, { userId: original, groupId: choir, startDate: "2045-07-01" })
    )
    expectSuccess(await addDirectMembership(t.db, { userId: corrected, groupId: choir, startDate: "2046-07-01" }))
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId: original,
        positionCode: PositionCode.ChoirKonsertmastare,
        contextGroupId: choir,
        organisationYear: 2045,
        startDate: "2045-09-01"
      })
    )
    expect(await endDirectMembership(t.db, { membershipId: originalMembership.id, endDate: "2045-10-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expectSuccess(
      await correctAnnualAppointment(t.db, {
        appointmentId: appointment.id,
        userId: corrected,
        positionCode: PositionCode.ChoirKonsertmastare,
        contextGroupId: choir,
        organisationYear: 2046,
        startDate: "2046-08-01",
        endDate: "2047-07-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, oldCommittee.id, "2045-10-01")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, nextCommittee.id, "2046-08-01")).toMatchObject([
      { userId: corrected, appointments: [{ contextGroupId: choir, organisationYear: 2046 }] }
    ])
    const ineligible = await t.user("Not a singer")
    const result = await appointPosition(t.db, {
      userId: ineligible,
      positionCode: PositionCode.ChoirKonsertmastare,
      contextGroupId: choir,
      organisationYear: 2046,
      startDate: "2046-09-01"
    })
    expect(result).toEqual({ success: false, error: "not-a-member" })
    expect((await listDirectMembersAt(t.db, choir, "2046-09-01")).some(({ userId }) => userId === ineligible)).toBe(
      false
    )
    expect(
      await correctAnnualAppointment(t.db, {
        appointmentId: appointment.id,
        userId: ineligible,
        positionCode: PositionCode.ChoirKonsertmastare,
        contextGroupId: choir,
        organisationYear: 2046,
        startDate: "2046-08-01",
        endDate: "2047-07-01"
      })
    ).toEqual({ success: false, error: "not-a-member" })
    expect(await listAppointmentMembersAt(t.db, nextCommittee.id, "2046-08-01")).toMatchObject([{ userId: corrected }])
  })

  test("Choir Gigmästare share annual Gigmästeri with the separate CSK office", async () => {
    const gigCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Gig 47/48 reps",
          type: GroupType.Gigmästeri,
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
          positionCode: PositionCode.ChoirGigmastare,
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
        positionCode: PositionCode.CskGigmastare,
        contextGroupId: board.id,
        startDate: "2047-07-01"
      })
    )
    const roster = await listEffectiveMembersAt(t.db, gigCommittee.id, "2047-09-01")
    expect(roster).toHaveLength(4)
    expect(roster.map(({ positions }) => positions[0]?.positionCode).sort()).toEqual([
      PositionCode.ChoirGigmastare,
      PositionCode.ChoirGigmastare,
      PositionCode.ChoirGigmastare,
      PositionCode.CskGigmastare
    ])
  })

  test("direct Choir Membership remains prerequisite evidence for a Choir appointment", async () => {
    const choirId = await t.groupId("KK")
    const userId = await t.user("Legacy singer")
    expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2048-07-01" }))
    const gigCommittee = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Gig 48/49", type: GroupType.Gigmästeri, organisationYear: 2048 },
        "4000-10-22"
      )
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.ChoirGigmastare,
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
          type: GroupType.Konsertmästeri,
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
          type: GroupType.Konsertmästeri,
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
        positionCode: PositionCode.ChoirKonsertmastare,
        contextGroupId: choirId,
        organisationYear: 2049,
        startDate: "2049-07-01"
      })
    )
    expectSuccess(
      await replaceAppointmentHolder(t.db, {
        userId: successor,
        positionCode: PositionCode.ChoirKonsertmastare,
        contextGroupId: choirId,
        organisationYear: 2049,
        startDate: "2049-11-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: successor,
        positionCode: PositionCode.ChoirKonsertmastare,
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
    expectSuccess(await createOrganisationGroup(t.db, { name: "Parents", type: GroupType.Föräldramötet }, "4000-10-22"))
    expect(
      await createOrganisationGroup(t.db, { name: "Other parents", type: GroupType.Föräldramötet }, "4000-10-22")
    ).toEqual({
      success: false,
      error: "group-name-taken"
    })
    const choirId = await t.groupId("MK")
    expectSuccess(
      await createOrganisationGroup(t.db, { name: "MK rodd", type: GroupType.Roddgrupp, choirId }, "4000-10-22")
    )
    expect(
      await createOrganisationGroup(t.db, { name: "MK other rodd", type: GroupType.Roddgrupp, choirId }, "4000-10-22")
    ).toEqual({
      success: false,
      error: "group-type-taken"
    })
    expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "DK rodd",
          type: GroupType.Roddgrupp,
          choirId: await t.groupId("DK")
        },
        "4000-10-22"
      )
    )
    for (const name of ["Gig A", "Gig B"])
      expectSuccess(await createOrganisationGroup(t.db, { name, type: GroupType.GigGroup }, "4000-10-22"))
  })

  test("fluid responsibilities cross the year boundary and correction preserves the Section singer", async () => {
    const otherChoir = await t.groupId("DK")
    const section = await t.groupId("KKB")
    const parents = await t.groupId("Parents")
    const userId = await t.user()
    expectSuccess(await addDirectMembership(t.db, { userId, groupId: section, startDate: "2052-01-01", voice: "B1" }))
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Stamforalder,
        contextGroupId: section,
        startDate: "2052-06-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, parents, "2052-07-01")).toMatchObject([{ userId }])
    expect(await listAppointmentMembersAt(t.db, parents, "2053-07-01")).toMatchObject([{ userId }])
    expectSuccess(
      await correctFluidAppointment(t.db, {
        appointmentId: appointment.id,
        userId,
        positionCode: PositionCode.Stamforalder,
        contextGroupId: section,
        startDate: "2052-06-15",
        endDate: null
      })
    )
    expect(await listAppointmentMembersAt(t.db, parents, "2052-06-14")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, parents, "2052-06-15")).toMatchObject([{ userId }])
    const [singerMembership] = await t.db
      .select({
        id: directMembership.id,
        groupId: directMembership.groupId,
        voice: directMembership.voice,
        endDate: directMembership.endDate
      })
      .from(directMembership)
      .where(and(eq(directMembership.userId, userId), eq(directMembership.groupId, section)))
    expect(singerMembership).toMatchObject({ groupId: section, voice: "B1", endDate: null })
    expect(await endDirectMembership(t.db, { membershipId: singerMembership.id, endDate: "2052-07-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(
      await correctFluidAppointment(t.db, {
        appointmentId: appointment.id,
        userId,
        positionCode: PositionCode.Dirigent,
        contextGroupId: otherChoir,
        startDate: "2052-06-15",
        endDate: null
      })
    ).toEqual({ success: false, error: "membership-dependency" })
    expect(await listAppointmentMembersAt(t.db, parents, "2052-06-15")).toMatchObject([{ userId }])
  })

  test("Dirigent, Notfiskal, and Gigledare stay fluid and ending Gigledare preserves direct Membership", async () => {
    const choir = await t.groupId("MK")
    const singer = await t.user()
    expectSuccess(await addDirectMembership(t.db, { userId: singer, groupId: choir, startDate: "2054-06-01" }))
    const dirigent = expectSuccess(
      await appointPosition(t.db, {
        userId: singer,
        positionCode: PositionCode.Dirigent,
        contextGroupId: choir,
        startDate: "2054-06-15"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: singer,
        positionCode: PositionCode.Notfiskal,
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
        positionCode: PositionCode.Gigledare,
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

  test("correcting Sekreterare retains the continuing parents meeting grant and a missing companion rolls back", async () => {
    const parents = await t.groupId("Parents")
    const oldBoard = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Board 41/42 secretary",
          type: GroupType.Board,
          organisationYear: 2041
        },
        "4000-10-22"
      )
    )
    const newBoard = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Board 42/43 secretary",
          type: GroupType.Board,
          organisationYear: 2042
        },
        "4000-10-22"
      )
    )
    const first = await t.user()
    const replacement = await t.user()
    const secretary = expectSuccess(
      await appointPosition(t.db, {
        userId: first,
        positionCode: PositionCode.Sekreterare,
        contextGroupId: oldBoard.id,
        startDate: "2041-07-01"
      })
    )
    expectSuccess(
      await correctAnnualAppointment(t.db, {
        appointmentId: secretary.id,
        userId: replacement,
        positionCode: PositionCode.Sekreterare,
        contextGroupId: newBoard.id,
        organisationYear: 2042,
        startDate: "2042-07-01",
        endDate: "2043-07-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, oldBoard.id, "2041-08-01")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, parents, "2042-08-01")).toMatchObject([{ userId: replacement }])

    const thirdBoard = expectSuccess(
      await createOrganisationGroup(
        t.db,
        {
          name: "Board 43/44 missing companion",
          type: GroupType.Board,
          organisationYear: 2043
        },
        "4000-10-22"
      )
    )
    const thirdUser = await t.user()
    const chair = expectSuccess(
      await appointPosition(t.db, {
        userId: thirdUser,
        positionCode: PositionCode.Ordforande,
        contextGroupId: thirdBoard.id,
        startDate: "2043-07-01"
      })
    )
    expect(
      await correctAnnualAppointment(t.db, {
        appointmentId: chair.id,
        userId: replacement,
        positionCode: PositionCode.ViceOrdforande,
        contextGroupId: thirdBoard.id,
        organisationYear: 2043,
        startDate: "2043-07-01",
        endDate: "2044-07-01"
      })
    ).toEqual({ success: false, error: "group-not-found" })
    expect(await listAppointmentMembersAt(t.db, thirdBoard.id, "2043-08-01")).toMatchObject([{ userId: thirdUser }])
  })

  test("storage refuses wrong scope, wrong annual bounds, and independent grant years", async () => {
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
          positionCode: PositionCode.Ordforande,
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
        positionCode: PositionCode.Ordforande,
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
    await expect(
      t.db.insert(appointmentGrant).values({ appointmentId: appointment.id, groupId: otherBoard.id }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "appointment_grant_policy_check" } })
    expect(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Kassor,
        contextGroupId: board.id,
        startDate: "2033-02-31"
      })
    ).toEqual({ success: false, error: "invalid-date" })
  })

  test("direct participation is separately dated, Voice checked, and protected against overlaps", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Archive 35/36", type: GroupType.Arkivarie, organisationYear: 2035 },
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
        positionCode: PositionCode.Dirigent,
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
        positionCode: PositionCode.Gigledare,
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
        positionCode: PositionCode.Gigledare,
        contextGroupId: groupId,
        startDate: "2038-09-01"
      })
    ).toEqual({ success: false, error: "not-a-member" })
  })
})
