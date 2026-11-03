import { afterAll, describe, expect, test } from "bun:test"
import { GroupType } from "@/core/org-structure"
import { createOrganisationGroup } from "./appointments"
import { addDirectMembership, listDirectMembersAt, listDirectMemberships } from "./direct-membership"
import { endMembership, placeSingerInSection } from "./membership"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("dated direct Membership", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())
  test("a September Helper belongs to that concrete year through June, never July", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Helpers 26/27", type: GroupType.SocialCommittee, organisationYear: 2026 },
        "4000-10-22"
      )
    ).id
    const userId = await t.user()
    const membership = expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" }))
    expect(await listDirectMembersAt(t.db, groupId, "2026-08-31")).toEqual([])
    expect(await listDirectMembersAt(t.db, groupId, "2027-06-30")).toMatchObject([{ userId }])
    expect(await listDirectMembersAt(t.db, groupId, "2027-07-01")).toEqual([])
    expect(await listDirectMemberships(t.db, groupId)).toMatchObject([{ id: membership.id, endDate: "2027-07-01" }])
  })

  test("fixed direct policies, Choir scope, and fluid lifetime apply to public additions", async () => {
    for (const type of [GroupType.Board, GroupType.ParentsMeeting] as const) {
      const groupId = expectSuccess(
        await createOrganisationGroup(
          t.db,
          {
            name: `${type} direct refusal`,
            type,
            ...(type === GroupType.Board ? { organisationYear: 2040 } : {})
          },
          "4000-10-22"
        )
      ).id
      expect(await addDirectMembership(t.db, { userId: await t.user(), groupId, startDate: "2040-09-01" })).toEqual({
        success: false,
        error: "direct-membership-forbidden"
      })
      expect(await listDirectMemberships(t.db, groupId)).toEqual([])
    }
    const choirId = await t.groupId("KK")
    expect(
      await createOrganisationGroup(t.db, { name: "Missing choir", type: GroupType.EquipmentTeam }, "4000-10-22")
    ).toEqual({
      success: false,
      error: "invalid-group-scope"
    })
    const groupId = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "KK fluid rodd", type: GroupType.EquipmentTeam, choirId },
        "4000-10-22"
      )
    ).id
    const userId = await t.user()
    expect(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" })).toEqual({
      success: false,
      error: "not-a-choir-member"
    })
    expectSuccess(
      await addDirectMembership(t.db, { userId, groupId: await t.groupId("KKB"), voice: "B2", startDate: "2026-09-01" })
    )
    expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" }))
    expect(await listDirectMembersAt(t.db, groupId, "2029-07-01")).toMatchObject([{ userId, endDate: null }])
  })

  test("leaving a Choir ends its Section and Choir-team membership in one command", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("MK")
    expectSuccess(
      await placeSingerInSection(t.db, {
        userId,
        sectionId: await t.groupId("MKB1"),
        voice: "B1",
        startDate: "2026-09-01"
      })
    )
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Departure fest", type: GroupType.PartyTeam, choirId }, "4000-10-22")
    ).id
    expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" }))
    expectSuccess(await endMembership(t.db, { userId, groupId: choirId, endDate: "2027-01-01" }))
    expect(await listDirectMembersAt(t.db, groupId, "2027-01-01")).toEqual([])
  })
  test("annual Groups cannot be created without their year", async () => {
    expect(
      await createOrganisationGroup(
        t.db,
        { name: "Missing year committee", type: GroupType.SocialCommittee },
        "4000-10-22"
      )
    ).toEqual({
      success: false,
      error: "period-conflict"
    })
  })
})
