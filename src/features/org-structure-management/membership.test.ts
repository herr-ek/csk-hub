import { afterAll, describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { directMembership } from "@/core/db/schema/org-structure"
import { GroupType, PositionCode } from "@/core/org-structure"
import { addDirectMembership, listDirectMembersAt } from "./direct-membership"
import { changeVoice, endMembership, placeSinger, placeSingerInSection, startMembership } from "./membership"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("Choir and Section Membership commands", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("a Choir-team Membership requires dated Choir coverage and Section Membership uses placement", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("MK")
    const team = expectSuccess(
      await import("./appointments").then(({ createOrganisationGroup }) =>
        createOrganisationGroup(t.db, { name: "Membership rodd", type: GroupType.Roddgrupp, choirId })
      )
    ).id
    expect(await startMembership(t.db, { userId, groupId: team, startDate: "2026-09-01" })).toEqual({
      success: false,
      error: "not-a-choir-member"
    })
    expect(await startMembership(t.db, { userId, groupId: await t.groupId("MKB1"), startDate: "2026-09-01" })).toEqual({
      success: false,
      error: "section-requires-placement"
    })
    expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2026-09-01" }))
    expectSuccess(await startMembership(t.db, { userId, groupId: team, startDate: "2026-09-01" }))
    expect(await listDirectMembersAt(t.db, team, "2026-09-01")).toMatchObject([{ userId }])
  })

  test("Voice placement finds the matching Section and creates Choir coverage", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("KK")
    const result = expectSuccess(await placeSinger(t.db, { userId, choirId, voice: "B2", startDate: "2024-08-01" }))
    expect(result.sectionId).toBe(await t.groupId("KKB"))
    expect(await listDirectMembersAt(t.db, choirId, "2024-08-01")).toMatchObject([{ userId }])
    expect(await listDirectMembersAt(t.db, result.sectionId, "2024-08-01")).toMatchObject([{ userId, voice: "B2" }])
    expect(
      await placeSingerInSection(t.db, {
        userId: await t.user(),
        sectionId: result.sectionId,
        voice: "T1",
        startDate: "2024-08-01"
      })
    ).toEqual({
      success: false,
      error: "voice-not-sung-in-section"
    })
  })

  test("Voice changes take effect on the requested day across Sections", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("DK")
    expectSuccess(
      await placeSingerInSection(t.db, {
        userId,
        sectionId: await t.groupId("DKS1"),
        voice: "S1",
        startDate: "2024-08-01"
      })
    )
    const moved = expectSuccess(await changeVoice(t.db, { userId, choirId, voice: "S2", date: "2025-01-01" }))
    expect(moved.sectionId).toBe(await t.groupId("DKS2"))
    expect(await listDirectMembersAt(t.db, await t.groupId("DKS1"), "2024-12-31")).toMatchObject([
      { userId, voice: "S1" }
    ])
    expect(await listDirectMembersAt(t.db, await t.groupId("DKS2"), "2025-01-01")).toMatchObject([
      { userId, voice: "S2" }
    ])
    expect(await changeVoice(t.db, { userId, choirId, voice: "S2", date: "2024-07-31" })).toEqual({
      success: false,
      error: "not-a-singer"
    })
  })

  test("a departure with an unfinished Choir appointment rolls back all dependent periods", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("MK")
    const sectionId = await t.groupId("MKB1")
    expectSuccess(await placeSingerInSection(t.db, { userId, sectionId, voice: "B1", startDate: "2024-01-01" }))
    const { appointPosition } = await import("./appointments")
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.Dirigent,
        contextGroupId: choirId,
        startDate: "2025-01-01"
      })
    )
    expect(await endMembership(t.db, { userId, groupId: choirId, endDate: "2026-01-01" })).toEqual({
      success: false,
      error: "membership-dependency"
    })
    expect(await listDirectMembersAt(t.db, choirId, "2026-01-01")).toMatchObject([{ userId }])
    expect(await listDirectMembersAt(t.db, sectionId, "2026-01-01")).toMatchObject([{ userId }])
  })

  test("end dates select the membership containing that day and preserve later history", async () => {
    const userId = await t.user()
    const choirId = await t.groupId("KK")
    expectSuccess(
      await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2020-01-01", endDate: "2022-01-01" })
    )
    expectSuccess(await addDirectMembership(t.db, { userId, groupId: choirId, startDate: "2024-01-01" }))
    expectSuccess(await endMembership(t.db, { userId, groupId: choirId, endDate: "2025-01-01" }))
    const rows = await t.db
      .select()
      .from(directMembership)
      .where(and(eq(directMembership.userId, userId), eq(directMembership.groupId, choirId)))
      .orderBy(directMembership.startDate)
    expect(rows.map(({ startDate, endDate }) => ({ startDate, endDate }))).toEqual([
      { startDate: "2020-01-01", endDate: "2022-01-01" },
      { startDate: "2024-01-01", endDate: "2025-01-01" }
    ])
  })
})
