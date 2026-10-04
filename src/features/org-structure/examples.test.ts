import { afterAll, describe, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { startLinkedPosition } from "./linked-positions"
import { placeSinger, startMembership } from "./membership"
import { startPositionHolding } from "./positions"
import { getCurrentPositionHolder, listChoirMembersByVoiceFamily, listCurrentGroupMembers } from "./reads"
import { createGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

// The worked examples from the Groups scheme (v3), expressed through the module's interface.

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("Groups scheme examples", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function rowsOf(userId: string) {
    const memberships = await t.db
      .select({ groupId: groupMember.groupId, startDate: groupMember.startDate, voice: groupMember.voice })
      .from(groupMember)
      .where(eq(groupMember.userId, userId))
      .orderBy(asc(groupMember.voice))
    const holdings = await t.db
      .select({
        groupId: positionHolder.groupId,
        positionId: positionHolder.positionId,
        startDate: positionHolder.startDate
      })
      .from(positionHolder)
      .where(eq(positionHolder.userId, userId))
      .orderBy(asc(positionHolder.startDate))
    return { memberships, holdings }
  }

  // His capability to cover B1 is in the voice feature's tests.
  test("Lucas sings B2 in KK", async () => {
    const lucas = await t.user("Lucas")
    const [kk, kkb] = [await t.groupId("KK"), await t.groupId("KKB")]

    expectSuccess(await placeSinger(t.db, { userId: lucas, choirId: kk, voice: "B2", startDate: "2024-08-20" }))

    expect((await rowsOf(lucas)).memberships).toEqual([
      { groupId: kkb, startDate: "2024-08-20", voice: "B2" },
      { groupId: kk, startDate: "2024-08-20", voice: null }
    ])
  })

  test("Sara sings B1 in KK and holds two Positions there", async () => {
    const sara = await t.user("Sara")
    const [kk, kkb] = [await t.groupId("KK"), await t.groupId("KKB")]
    const [notfiskal, konsertmastare] = [await t.positionId("Notfiskal"), await t.positionId("Konsertmästare")]

    expectSuccess(await placeSinger(t.db, { userId: sara, choirId: kk, voice: "B1", startDate: "2023-08-20" }))
    expectSuccess(
      await startPositionHolding(t.db, { userId: sara, groupId: kk, positionId: notfiskal, startDate: "2025-09-01" })
    )
    expectSuccess(
      await startPositionHolding(t.db, {
        userId: sara,
        groupId: kk,
        positionId: konsertmastare,
        startDate: "2026-09-01"
      })
    )

    expect(await rowsOf(sara)).toEqual({
      memberships: [
        { groupId: kkb, startDate: "2023-08-20", voice: "B1" },
        { groupId: kk, startDate: "2023-08-20", voice: null }
      ],
      holdings: [
        { groupId: kk, positionId: notfiskal, startDate: "2025-09-01" },
        { groupId: kk, positionId: konsertmastare, startDate: "2026-09-01" }
      ]
    })
  })

  test("Erik conducts KK without singing: a Choir Membership only", async () => {
    const erik = await t.user("Erik")
    const kk = await t.groupId("KK")
    const conductor = await t.positionId("Conductor")

    expectSuccess(await startMembership(t.db, { userId: erik, groupId: kk, startDate: "2020-01-10" }))
    expectSuccess(
      await startPositionHolding(t.db, { userId: erik, groupId: kk, positionId: conductor, startDate: "2020-01-10" })
    )

    expect(await rowsOf(erik)).toEqual({
      memberships: [{ groupId: kk, startDate: "2020-01-10", voice: null }],
      holdings: [{ groupId: kk, positionId: conductor, startDate: "2020-01-10" }]
    })
    expect((await listChoirMembersByVoiceFamily(t.db, kk, "B")).map(({ userId }) => userId)).not.toContain(erik)
  })

  test("Olof sings B2 in KK and is Stämförälder of KKB", async () => {
    const olof = await t.user("Olof")
    const [kk, kkb] = [await t.groupId("KK"), await t.groupId("KKB")]
    const stamforalder = await t.positionId("Stämförälder")

    expectSuccess(await placeSinger(t.db, { userId: olof, choirId: kk, voice: "B2", startDate: "2022-08-25" }))
    expectSuccess(
      await startPositionHolding(t.db, {
        userId: olof,
        groupId: kkb,
        positionId: stamforalder,
        startDate: "2025-09-01"
      })
    )

    expect(await getCurrentPositionHolder(t.db, kkb, stamforalder)).toEqual({ userId: olof, startDate: "2025-09-01" })
    expect((await listChoirMembersByVoiceFamily(t.db, kk, "B")).map(({ userId }) => userId)).toContain(olof)
  })

  test("Nils sings B1 in MK", async () => {
    const nils = await t.user("Nils")
    const [mk, mkb1] = [await t.groupId("MK"), await t.groupId("MKB1")]

    expectSuccess(await placeSinger(t.db, { userId: nils, choirId: mk, voice: "B1", startDate: "2024-08-22" }))

    expect((await rowsOf(nils)).memberships).toEqual([
      { groupId: mkb1, startDate: "2024-08-22", voice: "B1" },
      { groupId: mk, startDate: "2024-08-22", voice: null }
    ])
    // MK divides the basses, so no MK Section contains the family B.
    expect(
      await placeSinger(t.db, { userId: await t.user(), choirId: mk, voice: "B", startDate: "2024-08-22" })
    ).toEqual({ success: false, error: "voice-not-sung-in-choir" })
  })

  test("the Sexmästeri: two Position holders, two helpers, the Sexmästare also on the Board", async () => {
    const styret = await t.groupId("Styret")
    const { id: sexmasteri } = expectSuccess(await createGroup(t.db, { name: "Sexmästeri", type: "Sexmästeri" }))
    const [anna, bertil, cecilia, david] = [
      await t.user("Anna"),
      await t.user("Bertil"),
      await t.user("Cecilia"),
      await t.user("David")
    ]
    const [sexmastare, sexmastarinna] = [await t.positionId("Sexmästare"), await t.positionId("Sexmästarinna")]

    expectSuccess(
      await startLinkedPosition(t.db, {
        userId: anna,
        positionId: sexmastare,
        groupIds: [styret, sexmasteri],
        startDate: "2025-07-01"
      })
    )
    for (const userId of [bertil, cecilia, david]) {
      expectSuccess(await startMembership(t.db, { userId, groupId: sexmasteri, startDate: "2025-07-01" }))
    }
    expectSuccess(
      await startPositionHolding(t.db, {
        userId: bertil,
        groupId: sexmasteri,
        positionId: sexmastarinna,
        startDate: "2025-07-01"
      })
    )

    const members = (await listCurrentGroupMembers(t.db, sexmasteri)).map(({ userId }) => userId)
    expect(members.sort()).toEqual([anna, bertil, cecilia, david].sort())
    expect((await getCurrentPositionHolder(t.db, sexmasteri, sexmastare))?.userId).toBe(anna)
    expect((await getCurrentPositionHolder(t.db, styret, sexmastare))?.userId).toBe(anna)
    expect((await getCurrentPositionHolder(t.db, sexmasteri, sexmastarinna))?.userId).toBe(bertil)
    expect((await rowsOf(cecilia)).holdings).toEqual([])
  })
})
