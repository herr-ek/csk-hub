import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  appointPosition,
  createOrganisationGroup,
  endAppointment,
  listAppointmentMembersAt,
  listAppointmentsForGroup
} from "./appointments"
import { addDirectMembership, endDirectMembership, listDirectMemberships } from "./direct-membership"
import { listOrganisationGroups } from "./group-management"
import { changeVoice, endMembership, placeSinger } from "./membership"
import { listCurrentGroupMembers } from "./reads"
import { archiveGroup } from "./structure"
import {
  createOrgStructureTestDatabase,
  expectSuccess,
  type OrgStructureTestDatabase,
  uniqueName
} from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("fluid responsibility lifecycle", () => {
  let t: OrgStructureTestDatabase
  let parents: string

  beforeAll(async () => {
    t = database as OrgStructureTestDatabase
    parents = expectSuccess(
      await createOrganisationGroup(t.db, { name: uniqueName("Parents committee"), type: "Föräldramötet" })
    ).id
  })
  afterAll(async () => {
    await t.drop()
  })

  test("two Sections and the annual Secretary share one parents roster across June 30 and July 1", async () => {
    const board = expectSuccess(
      await createOrganisationGroup(t.db, { name: uniqueName("Board"), type: "Board", organisationYear: 2055 })
    )
    const firstSection = await t.groupId("MKT1", "MK")
    const secondSection = await t.groupId("MKT2", "MK")
    const secretary = await t.user("Secretary and Section parent")
    const secondParent = await t.user("Second Section parent")
    expectSuccess(
      await addDirectMembership(t.db, {
        userId: secretary,
        groupId: firstSection,
        startDate: "2055-07-01",
        voice: "T1"
      })
    )
    expectSuccess(
      await addDirectMembership(t.db, {
        userId: secondParent,
        groupId: secondSection,
        startDate: "2055-07-01",
        voice: "T2"
      })
    )

    const secretaryAppointment = expectSuccess(
      await appointPosition(t.db, {
        userId: secretary,
        positionCode: "sekreterare",
        contextGroupId: board.id,
        startDate: "2055-09-01"
      })
    )
    const firstAppointment = expectSuccess(
      await appointPosition(t.db, {
        userId: secretary,
        positionCode: "stamforalder",
        contextGroupId: firstSection,
        startDate: "2056-01-01"
      })
    )
    const secondAppointment = expectSuccess(
      await appointPosition(t.db, {
        userId: secondParent,
        positionCode: "stamforalder",
        contextGroupId: secondSection,
        startDate: "2056-01-01"
      })
    )

    const beforeFluidStart = await listAppointmentMembersAt(t.db, parents, "2055-09-01")
    expect(beforeFluidStart).toMatchObject([
      { userId: secretary, appointments: [{ id: secretaryAppointment.id, positionCode: "sekreterare" }] }
    ])

    const beforeEnd = await listAppointmentMembersAt(t.db, parents, "2056-06-29")
    expect(beforeEnd).toHaveLength(2)
    expect(beforeEnd.find(({ userId }) => userId === secretary)).toMatchObject({
      appointments: [
        { id: secretaryAppointment.id, positionCode: "sekreterare" },
        { id: firstAppointment.id, positionCode: "stamforalder", contextGroupId: firstSection }
      ]
    })
    const contexts = await listAppointmentsForGroup(t.db, parents)
    expect(contexts.find(({ id }) => id === firstAppointment.id)).toMatchObject({ contextName: "MKT1" })
    expect(contexts.find(({ id }) => id === secondAppointment.id)).toMatchObject({ contextName: "MKT2" })

    expectSuccess(await endAppointment(t.db, { appointmentId: secretaryAppointment.id, endDate: "2056-07-01" }))
    const juneRoster = await listAppointmentMembersAt(t.db, parents, "2056-06-30")
    expect(juneRoster).toHaveLength(2)
    expect(juneRoster.find(({ userId }) => userId === secretary)).toMatchObject({
      appointments: [
        { id: secretaryAppointment.id, positionCode: "sekreterare" },
        { id: firstAppointment.id, contextGroupId: firstSection }
      ]
    })
    expect(juneRoster.find(({ userId }) => userId === secondParent)).toMatchObject({
      appointments: [{ id: secondAppointment.id, contextGroupId: secondSection }]
    })

    const julyRoster = await listAppointmentMembersAt(t.db, parents, "2056-07-01")
    expect(julyRoster).toHaveLength(2)
    expect(julyRoster.flatMap(({ appointments }) => appointments.map(({ positionCode }) => positionCode))).toEqual([
      "stamforalder",
      "stamforalder"
    ])
  })

  test("a same-Section Voice change preserves Stämförälder; transfer and Choir departure are refused", async () => {
    const choir = await t.groupId("KK")
    const section = await t.groupId("KKT", "KK")
    const singer = await t.user("Voice changing parent")
    expectSuccess(await placeSinger(t.db, { userId: singer, choirId: choir, voice: "T1", startDate: "2057-01-01" }))
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId: singer,
        positionCode: "stamforalder",
        contextGroupId: section,
        startDate: "2057-02-01"
      })
    )

    expectSuccess(await changeVoice(t.db, { userId: singer, choirId: choir, voice: "T2", date: "2057-03-01" }))
    expect(await listCurrentGroupMembers(t.db, section)).toMatchObject([{ userId: singer, voice: "T2" }])
    expect(
      (await listAppointmentMembersAt(t.db, parents, "2057-03-01")).filter(({ userId }) => userId === singer)
    ).toMatchObject([{ userId: singer, appointments: [{ id: appointment.id, contextGroupId: section }] }])

    expect(await changeVoice(t.db, { userId: singer, choirId: choir, voice: "B1", date: "2057-04-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(await endMembership(t.db, { userId: singer, groupId: choir, endDate: "2057-04-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(await listCurrentGroupMembers(t.db, section)).toMatchObject([{ userId: singer, voice: "T2" }])
    expect(
      (await listAppointmentMembersAt(t.db, parents, "2057-04-01")).filter(({ userId }) => userId === singer)
    ).toMatchObject([{ userId: singer, appointments: [{ id: appointment.id, contextGroupId: section }] }])
  })

  test("membership shortening and Choir archive cannot strand a prepared future prerequisite", async () => {
    const choir = await t.groupId("DK")
    const singer = await t.user("Future Dirigent")
    const membership = expectSuccess(
      await addDirectMembership(t.db, { userId: singer, groupId: choir, startDate: "2058-01-01" })
    )
    const appointment = expectSuccess(
      await appointPosition(t.db, {
        userId: singer,
        positionCode: "dirigent",
        contextGroupId: choir,
        startDate: "2059-01-01"
      })
    )

    expect(await endDirectMembership(t.db, { membershipId: membership.id, endDate: "2058-12-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(await listDirectMemberships(t.db, choir)).toMatchObject([{ id: membership.id, endDate: null }])
    expect(await archiveGroup(t.db, choir)).toEqual({ success: false, error: "membership-dependency" })
    expect((await listOrganisationGroups(t.db, "2059-01-01")).find(({ id }) => id === choir)?.active).toBe(true)
    expect(await listAppointmentsForGroup(t.db, choir)).toMatchObject([
      { id: appointment.id, userId: singer, positionCode: "dirigent", startDate: "2059-01-01" }
    ])
  })
})
