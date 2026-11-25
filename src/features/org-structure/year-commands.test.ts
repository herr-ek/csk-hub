import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { createOrganisationGroup, listAppointmentsOfUser } from "./appointments"
import { addDirectMembership, changeDirectMembership, removeDirectMembership } from "./direct-membership"
import { changeVoice, endMembership, placeSinger } from "./membership"
import { createOrgStructureTestDatabase, expectSuccess, uniqueName } from "./test-support"
import { addGroupMembers, fillPosition, refillGigGroup } from "./year-commands"

const database = await createOrgStructureTestDatabase()
afterAll(() => database?.drop())

describe.skipIf(!database)("filling a year", () => {
  const t = database as NonNullable<typeof database>
  const TODAY = "2060-11-25"

  const groupsOf = (year: number) => t.db.select().from(group).where(eq(group.organisationYear, year))
  const membershipsOf = (userId: string) =>
    t.db.select().from(directMembership).where(eq(directMembership.userId, userId))

  test("the first planned holder sets up the year, and a change of mind swaps them", async () => {
    const [first, second] = [await t.user(), await t.user()]
    expect(await groupsOf(2061)).toEqual([])
    const input = { positionCode: PositionCode.Chair, organisationYear: 2061, startDate: "2061-07-01" }
    const planned = expectSuccess(await fillPosition(t.db, { ...input, userId: first }, TODAY))
    expect((await groupsOf(2061)).map(({ type }) => type)).toContain(GroupType.RecruitmentCommittee)

    expect(await fillPosition(t.db, { ...input, userId: second }, TODAY)).toEqual({
      success: false,
      error: "period-conflict"
    })
    expectSuccess(await fillPosition(t.db, { ...input, userId: second, replaces: planned.id }, TODAY))
    expect(await listAppointmentsOfUser(t.db, first)).toEqual([])
    expect(await listAppointmentsOfUser(t.db, second)).toMatchObject([
      { startDate: "2061-07-01", endDate: "2062-07-01" }
    ])
  })

  test("a year too far ahead, or a finished one, is never set up", async () => {
    const input = { positionCode: PositionCode.Chair, userId: await t.user() }
    expect(await fillPosition(t.db, { ...input, organisationYear: 2062, startDate: "2062-07-01" }, TODAY)).toEqual({
      success: false,
      error: "organisation-year-too-far-ahead"
    })
    expect(await fillPosition(t.db, { ...input, organisationYear: 2040, startDate: "2040-07-01" }, TODAY)).toEqual({
      success: false,
      error: "group-not-found"
    })
    expect(await groupsOf(2062)).toEqual([])
    expect(await groupsOf(2040)).toEqual([])
  })

  test("a holder filling in runs until the next planned one", async () => {
    const [substitute, successor] = [await t.user(), await t.user()]
    const input = { positionCode: PositionCode.Treasurer, organisationYear: 2060 }
    expectSuccess(await fillPosition(t.db, { ...input, userId: successor, startDate: "2061-02-01" }, TODAY))
    expectSuccess(await fillPosition(t.db, { ...input, userId: substitute, startDate: TODAY }, TODAY))
    expect(await listAppointmentsOfUser(t.db, substitute)).toMatchObject([{ startDate: TODAY, endDate: "2061-02-01" }])
  })

  test("a Choir representative sets up the year their committee belongs to", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("MK")
    expectSuccess(await placeSinger(t.db, { userId, choirId, voice: "T1", startDate: "2055-08-20" }))
    expectSuccess(
      await fillPosition(
        t.db,
        {
          userId,
          positionCode: PositionCode.ChoirGigCoordinator,
          contextGroupId: choirId,
          organisationYear: 2060,
          startDate: TODAY
        },
        TODAY
      )
    )
    expect(await listAppointmentsOfUser(t.db, userId)).toMatchObject([{ organisationYear: 2060 }])
  })

  test("members are added together or not at all, and recruitment needs a Voice they sing", async () => {
    const [alto, bass] = [await t.singer("A2"), await t.singer("B1")]
    const target = { type: GroupType.RecruitmentCommittee, organisationYear: 2060 }
    const add = (members: { userId: string; voiceFamily?: "A" | "B" }[]) =>
      addGroupMembers(t.db, { target, members, startDate: TODAY }, TODAY)

    expect(await add([{ userId: alto, voiceFamily: "A" }, { userId: bass }])).toEqual({
      success: false,
      error: "invalid-membership-voice"
    })
    expect(
      await add([
        { userId: alto, voiceFamily: "A" },
        { userId: bass, voiceFamily: "A" }
      ])
    ).toEqual({ success: false, error: "voice-not-sung-by-member" })
    expect(await membershipsOf(alto)).toEqual([])
    expectSuccess(
      await add([
        { userId: alto, voiceFamily: "A" },
        { userId: bass, voiceFamily: "B" }
      ])
    )
    expect(await membershipsOf(bass)).toMatchObject([{ voiceFamily: "B", voice: null, endDate: "2061-07-01" }])
  })

  test("a Voice family is refused anywhere else", async () => {
    expect(
      await addGroupMembers(
        t.db,
        {
          target: { type: GroupType.TourCommittee, organisationYear: 2060 },
          members: [{ userId: await t.singer("S1"), voiceFamily: "S" }],
          startDate: TODAY
        },
        TODAY
      )
    ).toEqual({ success: false, error: "invalid-membership-voice" })
  })

  test("a refill takes out leavers, changes Voices and brings in joiners, or does nothing", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: uniqueName("Refill"), type: GroupType.GigGroup })
    ).id
    const [leaver, stayer, joiner] = [await t.singer("B1"), await t.singer("B1", "B2"), await t.singer("T1")]
    const leaving = expectSuccess(
      await addDirectMembership(t.db, { userId: leaver, groupId, voice: "B1", startDate: "2059-01-01" })
    )
    const staying = expectSuccess(
      await addDirectMembership(t.db, { userId: stayer, groupId, voice: "B1", startDate: "2059-01-01" })
    )
    expectSuccess(
      await fillPosition(
        t.db,
        { userId: leaver, positionCode: PositionCode.GigLeader, contextGroupId: groupId, startDate: "2059-02-01" },
        TODAY
      )
    )
    const refill = (voice: "T1" | "S1") =>
      refillGigGroup(
        t.db,
        {
          groupId,
          date: "2061-01-10",
          leave: [leaving.id],
          voices: [{ membershipId: staying.id, voice: "B2" }],
          join: [{ userId: joiner, voice }]
        },
        TODAY
      )
    expect(await refill("S1")).toEqual({ success: false, error: "voice-not-sung-by-member" })
    expect(await membershipsOf(leaver)).toMatchObject([{ endDate: null }])

    expectSuccess(await refill("T1"))
    expect(await membershipsOf(leaver)).toMatchObject([{ endDate: "2061-01-10" }])
    expect(await listAppointmentsOfUser(t.db, leaver)).toMatchObject([{ endDate: "2061-01-10" }])
    expect(await membershipsOf(stayer)).toMatchObject([{ voice: "B2", startDate: "2059-01-01" }])
    expect(await membershipsOf(joiner)).toMatchObject([{ voice: "T1", startDate: "2061-01-10" }])
  })
})

describe.skipIf(!database)("changes that end Positions or correct the day's work", () => {
  const t = database as NonNullable<typeof database>
  const TODAY = "2060-11-25"

  async function sectionParent() {
    const userId = await t.user()
    const choirId = await t.groupId("MK")
    expectSuccess(await placeSinger(t.db, { userId, choirId, voice: "B2", startDate: "2055-08-20" }))
    const appointment = { userId, choirId, contextGroupId: await t.groupId("MKB2") }
    await t.db
      .insert(positionAppointment)
      .values({ ...appointment, positionCode: PositionCode.SectionParent, startDate: "2056-01-01" })
    return { userId, choirId }
  }
  const clear = () => t.db.delete(positionAppointment)

  test("moving Section ends Stämförälder only when that is accepted", async () => {
    await clear()
    const { userId, choirId } = await sectionParent()
    const move = { userId, choirId, voice: "B1" as const, date: TODAY }
    expect(await changeVoice(t.db, move, TODAY)).toEqual({ success: false, error: "membership-dependency" })
    expectSuccess(await changeVoice(t.db, { ...move, endAppointments: true }, TODAY))
    expect(await listAppointmentsOfUser(t.db, userId)).toMatchObject([{ endDate: TODAY }])
  })

  test("leaving a Choir drops planned periods and ends Positions when that is accepted", async () => {
    await clear()
    const { userId, choirId } = await sectionParent()
    expectSuccess(
      await changeVoice(t.db, { userId, choirId, voice: "B1", date: "2061-01-10", endAppointments: true }, TODAY)
    )
    expectSuccess(
      await endMembership(t.db, { userId, groupId: choirId, endDate: "2060-12-01", endAppointments: true }, TODAY)
    )
    const memberships = await t.db.select().from(directMembership).where(eq(directMembership.userId, userId))
    expect(memberships.map(({ endDate }) => endDate)).toEqual(["2060-12-01", "2060-12-01"])
    expect(await listAppointmentsOfUser(t.db, userId)).toMatchObject([{ endDate: "2060-12-01" }])
  })

  test("a change on the day a placement starts corrects it, unless that day has passed", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("MK")
    expectSuccess(await placeSinger(t.db, { userId, choirId, voice: "T1", startDate: TODAY }))
    expectSuccess(await changeVoice(t.db, { userId, choirId, voice: "T2", date: TODAY }, TODAY))
    const placements = (await t.db.select().from(directMembership).where(eq(directMembership.userId, userId))).filter(
      ({ voice }) => voice !== null
    )
    expect(placements).toMatchObject([{ voice: "T2", startDate: TODAY, endDate: null }])
    expect(await changeVoice(t.db, { userId, choirId, voice: "T1", date: TODAY }, "2060-11-26")).toEqual({
      success: false,
      error: "period-conflict"
    })
  })

  test("someone added today is taken away without a trace, others from a date", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: uniqueName("Other"), type: GroupType.Other })
    ).id
    const [today, before] = [await t.user(), await t.user()]
    const added = expectSuccess(await addDirectMembership(t.db, { userId: today, groupId, startDate: TODAY }))
    const earlier = expectSuccess(await addDirectMembership(t.db, { userId: before, groupId, startDate: "2060-01-01" }))
    expectSuccess(await removeDirectMembership(t.db, { membershipId: added.id, date: "2060-11-26" }, TODAY))
    expectSuccess(await removeDirectMembership(t.db, { membershipId: earlier.id, date: "2060-11-26" }, TODAY))
    expect(await t.db.select().from(directMembership).where(eq(directMembership.groupId, groupId))).toMatchObject([
      { userId: before, endDate: "2060-11-26" }
    ])
  })

  test("a gig Voice can only become one the singer sings, and is not checked again afterwards", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: uniqueName("Voices"), type: GroupType.GigGroup })
    ).id
    const userId = await t.singer("S1")
    const membership = expectSuccess(
      await addDirectMembership(t.db, { userId, groupId, voice: "S1", startDate: TODAY })
    )
    const change = { membershipId: membership.id, groupId, date: TODAY, endDate: null }
    expect(await changeDirectMembership(t.db, { ...change, voice: "S2" }, TODAY)).toEqual({
      success: false,
      error: "voice-not-sung-by-member"
    })
    const choirId = await t.groupId("DK")
    expectSuccess(await placeSinger(t.db, { userId, choirId, voice: "S2", startDate: "2060-01-01" }))
    expectSuccess(await changeDirectMembership(t.db, { ...change, voice: "S2" }, TODAY))
    expectSuccess(await changeVoice(t.db, { userId, choirId, voice: "A1", date: TODAY }, TODAY))
    expectSuccess(await changeDirectMembership(t.db, { ...change, voice: "S2" }, TODAY))
  })
})
