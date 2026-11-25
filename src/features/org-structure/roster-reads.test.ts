import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { GroupType, PositionCode } from "@/core/org-structure"
import { createOrganisationGroup } from "./appointments"
import { addDirectMembership } from "./direct-membership"
import { placeSinger } from "./membership"
import {
  getGigGroup,
  listChoirs,
  listCommittees,
  listOrganisationYears,
  listPeople,
  listPositionSlots,
  slotsGranting
} from "./roster-reads"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"
import { addGroupMembers, fillPosition } from "./year-commands"

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("rosters and Positions by year", () => {
  const t = database as NonNullable<typeof database>
  const TODAY = "2060-11-25"
  afterAll(() => t.drop())
  let singer: string
  let inactive: string

  beforeAll(async () => {
    singer = await t.singer("B2")
    inactive = await t.user("Inactive")
    expectSuccess(
      await placeSinger(t.db, {
        userId: singer,
        choirId: await t.groupId("MK"),
        voice: "B1",
        startDate: "2055-08-20"
      })
    )
    expectSuccess(
      await addGroupMembers(
        t.db,
        {
          target: { type: GroupType.NominationCommittee, organisationYear: 2060 },
          members: [{ userId: singer }, { userId: inactive }],
          startDate: "2060-07-01"
        },
        TODAY
      )
    )
    expectSuccess(
      await fillPosition(
        t.db,
        { userId: inactive, positionCode: PositionCode.Chair, organisationYear: 2060, startDate: "2060-07-01" },
        TODAY
      )
    )
    await t.db.update(user).set({ banned: true }).where(eq(user.id, inactive))
  })

  test("people carry their placements and every Voice they declare or sing; Inactive Users are left out", async () => {
    const people = await listPeople(t.db, TODAY)
    expect(people.find(({ id }) => id === singer)).toMatchObject({
      choirs: [{ name: "MK" }],
      placements: [{ sectionName: "MKB1", voice: "B1", divided: true, choirSince: "2055-08-20" }],
      voices: ["B1", "B2"]
    })
    expect(people.some(({ id }) => id === inactive)).toBe(false)
  })

  test("Choirs and Sections come in reference order", async () => {
    const choirs = await listChoirs(t.db)
    expect(choirs.map(({ name }) => name)).toEqual(["MK", "DK", "KK"])
    expect(choirs[1]?.sections.map(({ name }) => name)).toEqual(["DKS1", "DKS2", "DKA1", "DKA2"])
  })

  test("every Position is listed, vacant or not, and an Inactive holder is marked rather than hidden", async () => {
    const slots = await listPositionSlots(t.db, 2060, TODAY)
    // Eight Board offices, two committee offices, four per Choir and one per Section.
    expect(slots).toHaveLength(8 + 2 + 3 * 4 + 12)
    expect(slots.find(({ positionCode }) => positionCode === PositionCode.Chair)?.holders).toMatchObject([
      { userId: inactive, inactive: true }
    ])
    expect(slotsGranting(slots, GroupType.GigCommittee).map(({ positionCode }) => positionCode)).toEqual([
      PositionCode.OrganisationGigCoordinator,
      PositionCode.ChoirGigCoordinator,
      PositionCode.ChoirGigCoordinator,
      PositionCode.ChoirGigCoordinator
    ])
  })

  test("a year nobody has set up still shows its empty Positions and committees", async () => {
    expect(await listOrganisationYears(t.db, TODAY)).toEqual([2060, 2061])
    const chair = (await listPositionSlots(t.db, 2061, TODAY)).find(
      ({ positionCode }) => positionCode === PositionCode.Chair
    )
    expect(chair).toMatchObject({ contextGroupId: null, holders: [] })
    const committees = await listCommittees(t.db, 2061, TODAY)
    expect(committees.find(({ key }) => key === GroupType.NominationCommittee)).toMatchObject({
      groupId: null,
      members: []
    })
  })

  test("a roster leaves out Inactive Users until its year is over", async () => {
    const members = async (today: string) =>
      (await listCommittees(t.db, 2060, today)).find(({ key }) => key === GroupType.NominationCommittee)?.members
    expect(await members(TODAY)).toMatchObject([{ userId: singer, choirs: [{ name: "MK" }] }])
    expect((await members("2061-07-01"))?.map(({ userId }) => userId).sort()).toEqual([inactive, singer].sort())
  })

  test("ongoing committees and Other Groups belong to no year", async () => {
    const other = expectSuccess(await createOrganisationGroup(t.db, { name: "Jubilee", type: GroupType.Other })).id
    const committees = await listCommittees(t.db, 2061, TODAY)
    expect(committees.filter(({ organisationYear }) => organisationYear === null).map(({ key }) => key)).toEqual([
      GroupType.MemorisationCommittee,
      other
    ])
  })

  test("a gig group shows its line-up and Gigledare", async () => {
    const groupId = expectSuccess(await createOrganisationGroup(t.db, { name: "Line-up", type: GroupType.GigGroup })).id
    expectSuccess(await addDirectMembership(t.db, { userId: singer, groupId, voice: "B2", startDate: "2060-01-01" }))
    expectSuccess(
      await fillPosition(
        t.db,
        { userId: singer, positionCode: PositionCode.GigLeader, contextGroupId: groupId, startDate: TODAY },
        TODAY
      )
    )
    expect(await getGigGroup(t.db, groupId, TODAY)).toMatchObject({
      members: [{ userId: singer, voice: "B2" }],
      leader: { holders: [{ userId: singer }] }
    })
    expect(await getGigGroup(t.db, await t.groupId("MK"), TODAY)).toBeNull()
  })
})
