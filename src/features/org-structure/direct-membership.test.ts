import { afterAll, describe, expect, test } from "bun:test"
import { appointPosition, createOrganisationGroup } from "./appointments"
import {
  addDirectMembership,
  changeDirectMembership,
  correctDirectMembership,
  correctLegacyMembership,
  endDirectMembership,
  listDirectMembersAt,
  listDirectMemberships
} from "./direct-membership"
import { endMembership, placeSingerInSection, startMembership } from "./membership"
import { listCurrentGroupMembers } from "./reads"
import { createGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("dated direct Membership", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())
  test("a September Helper belongs to that concrete year through June, never July", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Helpers 26/27", type: "Sexmästeri", organisationYear: 2026 })
    ).id
    const userId = await t.user()
    const membership = expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" }))
    expect(await listDirectMembersAt(t.db, groupId, "2026-08-31")).toEqual([])
    expect(await listDirectMembersAt(t.db, groupId, "2027-06-30")).toMatchObject([{ userId }])
    expect(await listDirectMembersAt(t.db, groupId, "2027-07-01")).toEqual([])
    expect(await listDirectMemberships(t.db, groupId)).toMatchObject([{ id: membership.id, endDate: "2027-07-01" }])
  })
  test("corrections update historical and prepared records while invalid corrections leave reads unchanged", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Archive 27/28", type: "Arkivarie", organisationYear: 2027 })
    ).id
    const userId = await t.user()
    const { id } = expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2027-09-01" }))
    expectSuccess(
      await correctDirectMembership(t.db, { membershipId: id, groupId, startDate: "2027-08-01", endDate: "2028-06-01" })
    )
    expect(await listDirectMembersAt(t.db, groupId, "2027-08-01")).toMatchObject([{ id, userId }])
    const before = await listDirectMemberships(t.db, groupId)
    expect(
      await correctDirectMembership(t.db, { membershipId: id, groupId, startDate: "2027-08-01", endDate: null })
    ).toEqual({ success: false, error: "period-conflict" })
    expect(await listDirectMemberships(t.db, groupId)).toEqual(before)
    expectSuccess(await endDirectMembership(t.db, { membershipId: id, endDate: "2028-05-01" }))
    expect(await listDirectMembersAt(t.db, groupId, "2028-05-01")).toEqual([])
  })

  test("fixed direct policies, Choir scope, and fluid lifetime apply to public additions", async () => {
    for (const type of ["Board", "Föräldramötet"] as const) {
      const groupId = expectSuccess(
        await createOrganisationGroup(t.db, {
          name: `${type} direct refusal`,
          type,
          ...(type === "Board" ? { organisationYear: 2040 } : {})
        })
      ).id
      expect(await addDirectMembership(t.db, { userId: await t.user(), groupId, startDate: "2040-09-01" })).toEqual({
        success: false,
        error: "direct-membership-forbidden"
      })
      expect(await listDirectMemberships(t.db, groupId)).toEqual([])
    }
    const choirId = await t.groupId("KK")
    expect(await createOrganisationGroup(t.db, { name: "Missing choir", type: "Roddgrupp" })).toEqual({
      success: false,
      error: "invalid-group-scope"
    })
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "KK fluid rodd", type: "Roddgrupp", choirId })
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

  test("ordinary Voice changes preserve earlier periods and corrections preserve one Section per Choir", async () => {
    const groupId = await t.groupId("KKB")
    const userId = await t.user()
    const { id } = expectSuccess(
      await addDirectMembership(t.db, { userId, groupId, voice: "B1", startDate: "2025-09-01" })
    )
    expectSuccess(
      await changeDirectMembership(t.db, { membershipId: id, groupId, voice: "B2", date: "2026-01-01", endDate: null })
    )
    expect(
      (await listDirectMembersAt(t.db, groupId, "2025-12-31")).find((member) => member.userId === userId)?.voice
    ).toBe("B1")
    expect(
      (await listDirectMembersAt(t.db, groupId, "2026-01-01")).find((member) => member.userId === userId)?.voice
    ).toBe("B2")
    expect(
      await addDirectMembership(t.db, { userId, groupId: await t.groupId("KKT"), voice: "T1", startDate: "2025-10-01" })
    ).toEqual({ success: false, error: "already-in-section" })
    expect(
      await correctDirectMembership(t.db, {
        membershipId: id,
        groupId,
        voice: "T1",
        startDate: "2025-09-01",
        endDate: "2026-01-01"
      })
    ).toEqual({ success: false, error: "voice-not-sung-in-section" })
  })
  test("shortening prerequisite Membership or transferring its Section refuses without partial changes", async () => {
    const groupId = await t.groupId("KKB")
    const userId = await t.user()
    const { id } = expectSuccess(
      await addDirectMembership(t.db, { userId, groupId, voice: "B1", startDate: "2033-01-01" })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        contextGroupId: groupId,
        positionCode: "stamforalder",
        startDate: "2033-02-01"
      })
    )
    const before = await listDirectMemberships(t.db, groupId)
    expect(await endDirectMembership(t.db, { membershipId: id, endDate: "2033-03-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(
      await correctDirectMembership(t.db, {
        membershipId: id,
        groupId: await t.groupId("KKT"),
        voice: "T1",
        startDate: "2033-01-01",
        endDate: null
      })
    ).toEqual({ success: false, error: "membership-dependency" })
    expect(await listDirectMemberships(t.db, groupId)).toEqual(before)
    expectSuccess(
      await changeDirectMembership(t.db, { membershipId: id, groupId, voice: "B2", date: "2033-03-01", endDate: null })
    )
  })

  test("an explicit legacy singer correction updates dated placement without overlapping another Section", async () => {
    const userId = await t.user()
    const groupId = await t.groupId("DKS1")
    expectSuccess(
      await placeSingerInSection(t.db, { userId, sectionId: groupId, voice: "S1", startDate: "2024-09-01" })
    )
    expectSuccess(
      await correctLegacyMembership(t.db, {
        userId,
        originalGroupId: groupId,
        originalStartDate: "2024-09-01",
        groupId: await t.groupId("DKS2"),
        voice: "S2",
        startDate: "2024-09-01",
        endDate: null
      })
    )
    expect(await addDirectMembership(t.db, { userId, groupId, voice: "S1", startDate: "2025-01-01" })).toEqual({
      success: false,
      error: "already-in-section"
    })
  })
  test("legacy Choir departure cannot strand new-model scoped membership", async () => {
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
      await createOrganisationGroup(t.db, { name: "Departure fest", type: "Festgrupp", choirId })
    ).id
    expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" }))
    expect(await endMembership(t.db, { userId, groupId: choirId, endDate: "2027-01-01" })).toEqual({
      success: false,
      error: "not-a-choir-member"
    })
    expect(await listDirectMembersAt(t.db, groupId, "2027-01-01")).toMatchObject([{ userId }])
  })
  test("unresolved legacy annual Groups cannot accept open-ended direct participation", async () => {
    const groupId = expectSuccess(await createGroup(t.db, { name: "Legacy unresolved annual", type: "Sexmästeri" })).id
    const userId = await t.user()
    expect(await startMembership(t.db, { userId, groupId, startDate: "2026-09-01" })).toEqual({
      success: false,
      error: "annual-group-needs-year"
    })
    expect(await addDirectMembership(t.db, { userId, groupId, startDate: "2026-09-01" })).toEqual({
      success: false,
      error: "annual-group-needs-year"
    })
    expect(await listCurrentGroupMembers(t.db, groupId)).toEqual([])
    expect(await listDirectMemberships(t.db, groupId)).toEqual([])
  })
})
