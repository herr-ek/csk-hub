import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { appointmentGrant, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import {
  appointPosition,
  correctAnnualAppointment,
  createOrganisationGroup,
  listAppointmentMembersAt,
  listEffectiveMembersAt,
  replaceAppointmentHolder
} from "./appointments"
import { addDirectMembership, endDirectMembership, listDirectMembersAt } from "./direct-membership"
import { createOrgStructureTestDatabase, expectSuccess, type OrgStructureTestDatabase } from "./test-support"

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
      await createOrganisationGroup(t.db, { name: "Board 26/27", type: "Board", organisationYear: 2026 })
    )
    const committee = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Sexmästeriet 26/27", type: "Sexmästeri", organisationYear: 2026 })
    )
    const userId = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: "sexmastare",
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

  test("appointing a committee officer converts an overlapping Helper and preserves the earlier period", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 37/38 helper", type: "Board", organisationYear: 2037 })
    )
    const committee = expectSuccess(
      await createOrganisationGroup(t.db, {
        name: "Sexmästeriet 37/38 helper",
        type: "Sexmästeri",
        organisationYear: 2037
      })
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
        positionCode: "sexmastare",
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
      await createOrganisationGroup(t.db, { name: "Board 38/39 handover", type: "Board", organisationYear: 2038 })
    )
    const incumbent = await t.user()
    expectSuccess(
      await appointPosition(t.db, {
        userId: incumbent,
        positionCode: "ordforande",
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
          positionCode: "ordforande",
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
      await createOrganisationGroup(t.db, { name: "Board 39/40 correction", type: "Board", organisationYear: 2039 })
    )
    const sexA = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Sex 39/40 correction", type: "Sexmästeri", organisationYear: 2039 })
    )
    const boardB = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 40/41 correction", type: "Board", organisationYear: 2040 })
    )
    const sexB = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Sex 40/41 correction", type: "Sexmästeri", organisationYear: 2040 })
    )
    const first = await t.user()
    const corrected = await t.user()
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId: first,
        positionCode: "sexmastare",
        contextGroupId: boardA.id,
        startDate: "2039-07-01"
      })
    )
    expectSuccess(
      await correctAnnualAppointment(t.db, {
        appointmentId: appointment.id,
        userId: corrected,
        positionCode: "sexmastare",
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
      await createOrganisationGroup(t.db, { name: "Board 27/28", type: "Board", organisationYear: 2027 })
    )
    const results = await Promise.all(
      [await t.user(), await t.user()].map((userId) =>
        appointPosition(t.db, {
          userId,
          positionCode: "ordforande",
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
      await createOrganisationGroup(t.db, { name: "Board 28/29", type: "Board", organisationYear: 2028 })
    )
    await t.db.transaction(async (tx) => {
      expect(
        await appointPosition(tx, {
          userId: await t.user(),
          positionCode: "sexmastare",
          contextGroupId: board.id,
          startDate: "2028-07-01"
        })
      ).toEqual({ success: false, error: "group-not-found" })
      expect(await listAppointmentMembersAt(tx, board.id, "2028-07-01")).toEqual([])
      expectSuccess(
        await appointPosition(tx, {
          userId: await t.user(),
          positionCode: "ordforande",
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
      await createOrganisationGroup(t.db, { name: "Board 29/30", type: "Board", organisationYear: 2029 })
    )
    const first = await t.user()
    const second = await t.user()
    expectSuccess(
      await appointPosition(t.db, {
        userId: first,
        positionCode: "ordforande",
        contextGroupId: board.id,
        startDate: "2029-09-01",
        endDate: "2030-01-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: second,
        positionCode: "ordforande",
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
      await createOrganisationGroup(t.db, { name: "Board 30/31", type: "Board", organisationYear: 2030 })
    )
    const userId = await t.user()
    const results = await Promise.all(
      (["ordforande", "kassor"] as const).map((positionCode) =>
        appointPosition(t.db, { userId, positionCode, contextGroupId: board.id, startDate: "2030-07-01" })
      )
    )
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "already-holding-elected-post" })
  })

  test("same-title representatives from independent Choir contexts share one committee", async () => {
    const committee = expectSuccess(
      await createOrganisationGroup(t.db, {
        name: "Konsertmästeriet 31/32",
        type: "Konsertmästeri",
        organisationYear: 2031
      })
    )
    const board = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 31/32", type: "Board", organisationYear: 2031 })
    )
    const userId = await t.user()
    for (const choir of ["MK", "DK", "KK"]) {
      const contextGroupId = await t.groupId(choir)
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: contextGroupId, startDate: "2031-07-01" }))
      expectSuccess(
        await appointPosition(t.db, {
          userId,
          positionCode: "choir-konsertmastare",
          contextGroupId,
          organisationYear: 2031,
          startDate: "2031-09-01"
        })
      )
    }
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user(),
        positionCode: "forsta-konsertmastare",
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
      await createOrganisationGroup(t.db, {
        name: "Konsert 45/46 reps",
        type: "Konsertmästeri",
        organisationYear: 2045
      })
    )
    const nextCommittee = expectSuccess(
      await createOrganisationGroup(t.db, {
        name: "Konsert 46/47 reps",
        type: "Konsertmästeri",
        organisationYear: 2046
      })
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
        positionCode: "choir-konsertmastare",
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
        positionCode: "choir-konsertmastare",
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
      positionCode: "choir-konsertmastare",
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
        positionCode: "choir-konsertmastare",
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
      await createOrganisationGroup(t.db, { name: "Gig 47/48 reps", type: "Gigmästeri", organisationYear: 2047 })
    )
    const board = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 47/48 gig", type: "Board", organisationYear: 2047 })
    )
    for (const choirName of ["MK", "DK", "KK"]) {
      const userId = await t.user(`${choirName} representative`)
      const choirId = await t.groupId(choirName)
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2047-07-01" }))
      expectSuccess(
        await appointPosition(t.db, {
          userId,
          positionCode: "choir-gigmastare",
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
        positionCode: "csk-gigmastare",
        contextGroupId: board.id,
        startDate: "2047-07-01"
      })
    )
    const roster = await listEffectiveMembersAt(t.db, gigCommittee.id, "2047-09-01")
    expect(roster).toHaveLength(4)
    expect(roster.map(({ positions }) => positions[0]?.positionCode).sort()).toEqual([
      "choir-gigmastare",
      "choir-gigmastare",
      "choir-gigmastare",
      "csk-gigmastare"
    ])
  })

  test("existing Choir Membership remains valid prerequisite evidence during additive migration", async () => {
    const choirId = await t.groupId("KK")
    const userId = await t.user("Legacy singer")
    await t.legacyMember({ userId, groupId: choirId, startDate: "2048-07-01" })
    const gigCommittee = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Gig 48/49 legacy", type: "Gigmästeri", organisationYear: 2048 })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: "choir-gigmastare",
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
      await createOrganisationGroup(t.db, {
        name: "Konsert 49/50 lifecycle",
        type: "Konsertmästeri",
        organisationYear: 2049
      })
    )
    const nextCommittee = expectSuccess(
      await createOrganisationGroup(t.db, {
        name: "Konsert 50/51 lifecycle",
        type: "Konsertmästeri",
        organisationYear: 2050
      })
    )
    const incumbent = await t.user("Choir incumbent")
    const successor = await t.user("Choir successor")
    for (const userId of [incumbent, successor])
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2049-07-01" }))
    expectSuccess(
      await appointPosition(t.db, {
        userId: incumbent,
        positionCode: "choir-konsertmastare",
        contextGroupId: choirId,
        organisationYear: 2049,
        startDate: "2049-07-01"
      })
    )
    expectSuccess(
      await replaceAppointmentHolder(t.db, {
        userId: successor,
        positionCode: "choir-konsertmastare",
        contextGroupId: choirId,
        organisationYear: 2049,
        startDate: "2049-11-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: successor,
        positionCode: "choir-konsertmastare",
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
      ["A", "B"].map((name) => createOrganisationGroup(t.db, { name, type: "Board", organisationYear: 2032 }))
    )
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "group-name-taken" })
    expectSuccess(await createOrganisationGroup(t.db, { name: "Parents", type: "Föräldramötet" }))
    expect(await createOrganisationGroup(t.db, { name: "Other parents", type: "Föräldramötet" })).toEqual({
      success: false,
      error: "group-name-taken"
    })
    const choirId = await t.groupId("MK")
    expectSuccess(await createOrganisationGroup(t.db, { name: "MK rodd", type: "Roddgrupp", choirId }))
    expect(await createOrganisationGroup(t.db, { name: "MK other rodd", type: "Roddgrupp", choirId })).toEqual({
      success: false,
      error: "group-type-taken"
    })
    expectSuccess(
      await createOrganisationGroup(t.db, { name: "DK rodd", type: "Roddgrupp", choirId: await t.groupId("DK") })
    )
    for (const name of ["Gig A", "Gig B"])
      expectSuccess(await createOrganisationGroup(t.db, { name, type: "GigGroup" }))
  })

  test("correcting Sekreterare retains the continuing parents meeting grant and a missing companion rolls back", async () => {
    const parents = await t.groupId("Parents")
    const oldBoard = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 41/42 secretary", type: "Board", organisationYear: 2041 })
    )
    const newBoard = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 42/43 secretary", type: "Board", organisationYear: 2042 })
    )
    const first = await t.user()
    const replacement = await t.user()
    const secretary = expectSuccess(
      await appointPosition(t.db, {
        userId: first,
        positionCode: "sekreterare",
        contextGroupId: oldBoard.id,
        startDate: "2041-07-01"
      })
    )
    expectSuccess(
      await correctAnnualAppointment(t.db, {
        appointmentId: secretary.id,
        userId: replacement,
        positionCode: "sekreterare",
        contextGroupId: newBoard.id,
        organisationYear: 2042,
        startDate: "2042-07-01",
        endDate: "2043-07-01"
      })
    )
    expect(await listAppointmentMembersAt(t.db, oldBoard.id, "2041-08-01")).toEqual([])
    expect(await listAppointmentMembersAt(t.db, parents, "2042-08-01")).toMatchObject([{ userId: replacement }])

    const thirdBoard = expectSuccess(
      await createOrganisationGroup(t.db, {
        name: "Board 43/44 missing companion",
        type: "Board",
        organisationYear: 2043
      })
    )
    const thirdUser = await t.user()
    const chair = expectSuccess(
      await appointPosition(t.db, {
        userId: thirdUser,
        positionCode: "ordforande",
        contextGroupId: thirdBoard.id,
        startDate: "2043-07-01"
      })
    )
    expect(
      await correctAnnualAppointment(t.db, {
        appointmentId: chair.id,
        userId: replacement,
        positionCode: "vice-ordforande",
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
        .values({ name: "Bad scope", type: "GigGroup", choirId: await t.groupId("MK"), usesAppointmentModel: true })
        .execute()
    ).rejects.toMatchObject({ cause: { constraint: "group_organisation_policy_check" } })
    const board = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 33/34", type: "Board", organisationYear: 2033 })
    )
    const userId = await t.user()
    await expect(
      t.db
        .insert(positionAppointment)
        .values({
          userId,
          positionCode: "ordforande",
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
        positionCode: "ordforande",
        contextGroupId: board.id,
        startDate: "2033-07-01"
      })
    )
    const otherBoard = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Board 34/35", type: "Board", organisationYear: 2034 })
    )
    await expect(
      t.db.insert(appointmentGrant).values({ appointmentId: appointment.id, groupId: otherBoard.id }).execute()
    ).rejects.toMatchObject({ cause: { constraint: "appointment_grant_policy_check" } })
    expect(
      await appointPosition(t.db, { userId, positionCode: "kassor", contextGroupId: board.id, startDate: "2033-02-31" })
    ).toEqual({ success: false, error: "invalid-date" })
  })

  test("direct participation is separately dated, Voice checked, and protected against overlaps", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Archive 35/36", type: "Arkivarie", organisationYear: 2035 })
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
      await createOrganisationGroup(t.db, { name: "Board 35/36", type: "Board", organisationYear: 2035 })
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
        positionCode: "dirigent",
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
      await createOrganisationGroup(t.db, { name: "Continuous gig membership", type: "GigGroup" })
    ).id
    const userId = await t.user()
    await t.db.insert(directMembership).values([
      { userId, groupId, startDate: "2038-07-01", endDate: "2039-01-01" },
      { userId, groupId, startDate: "2039-01-01", endDate: null }
    ])
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: "gigledare",
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
        positionCode: "gigledare",
        contextGroupId: groupId,
        startDate: "2038-09-01"
      })
    ).toEqual({ success: false, error: "not-a-member" })
  })
})
