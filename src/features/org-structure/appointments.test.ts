import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { appointmentGrant, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { appointPosition, createOrganisationGroup, listAppointmentMembersAt } from "./appointments"
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
      await t.db.insert(directMembership).values({ userId, groupId: contextGroupId, startDate: "2031-07-01" })
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
      error: "group-name-taken"
    })
    expectSuccess(
      await createOrganisationGroup(t.db, { name: "DK rodd", type: "Roddgrupp", choirId: await t.groupId("DK") })
    )
    for (const name of ["Gig A", "Gig B"])
      expectSuccess(await createOrganisationGroup(t.db, { name, type: "GigGroup" }))
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
