import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { groupMember, positionHolder } from "@/core/db/schema/org-structure"
import { endLinkedPosition, startLinkedPosition } from "./linked-positions"
import { startMembership } from "./membership"
import { endPositionHolding, startPositionHolding } from "./positions"
import { getCurrentPositionHolder } from "./reads"
import { createGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("groups positions", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function member(groupId: string, startDate = "2025-01-01") {
    const userId = await t.user()
    expectSuccess(await startMembership(t.db, { userId, groupId, startDate }))
    return userId
  }

  async function newGroup(type: "Board" | "Sexmästeri" | "Fest") {
    const { id } = expectSuccess(await createGroup(t.db, { name: uniqueName(type), type }))
    return id
  }

  test("a member holds a Position allowed in the group's type", async () => {
    const kk = await t.groupId("KK")
    const conductor = await t.positionId("Conductor")
    const userId = await member(kk)

    expectSuccess(
      await startPositionHolding(t.db, { userId, groupId: kk, positionId: conductor, startDate: "2025-02-01" })
    )
    expect(await getCurrentPositionHolder(t.db, kk, conductor)).toEqual({ userId, startDate: "2025-02-01" })
  })

  test("requires a current Membership in the group", async () => {
    const userId = await t.user()
    const dk = await t.groupId("DK")
    expect(
      await startPositionHolding(t.db, {
        userId,
        groupId: dk,
        positionId: await t.positionId("Notfiskal"),
        startDate: "2025-01-01"
      })
    ).toEqual({ success: false, error: "not-a-member" })
  })

  test("cannot start before the Membership does", async () => {
    const dk = await t.groupId("DK")
    const userId = await member(dk, "2025-01-01")
    expect(
      await startPositionHolding(t.db, {
        userId,
        groupId: dk,
        positionId: await t.positionId("Konsertmästare"),
        startDate: "2024-01-01"
      })
    ).toEqual({ success: false, error: "period-conflict" })
  })

  test("refuses a Position the group's type does not allow", async () => {
    const fest = await newGroup("Fest")
    const userId = await member(fest)
    expect(
      await startPositionHolding(t.db, {
        userId,
        groupId: fest,
        positionId: await t.positionId("Conductor"),
        startDate: "2025-01-01"
      })
    ).toEqual({ success: false, error: "position-not-allowed" })
  })

  test("one holder per Position per group, while one person may hold several", async () => {
    const mk = await t.groupId("MK")
    const [first, second] = [await member(mk), await member(mk)]
    const [notfiskal, konsertmastare] = [await t.positionId("Notfiskal"), await t.positionId("Konsertmästare")]

    expectSuccess(
      await startPositionHolding(t.db, { userId: first, groupId: mk, positionId: notfiskal, startDate: "2025-01-01" })
    )
    expectSuccess(
      await startPositionHolding(t.db, {
        userId: first,
        groupId: mk,
        positionId: konsertmastare,
        startDate: "2025-01-01"
      })
    )
    expect(
      await startPositionHolding(t.db, { userId: second, groupId: mk, positionId: notfiskal, startDate: "2025-01-01" })
    ).toEqual({ success: false, error: "position-taken" })

    expectSuccess(
      await endPositionHolding(t.db, { userId: first, groupId: mk, positionId: notfiskal, endDate: "2025-06-30" })
    )
    expectSuccess(
      await startPositionHolding(t.db, { userId: second, groupId: mk, positionId: notfiskal, startDate: "2025-07-01" })
    )
    expect((await getCurrentPositionHolder(t.db, mk, notfiskal))?.userId).toBe(second)
  })

  test("ending a holding the user does not hold is refused", async () => {
    const kk = await t.groupId("KK")
    const userId = await member(kk)
    expect(
      await endPositionHolding(t.db, {
        userId,
        groupId: kk,
        positionId: await t.positionId("Notfiskal"),
        endDate: "2025-06-30"
      })
    ).toEqual({ success: false, error: "not-holding-position" })
  })

  describe("linked positions", () => {
    test("starts the Position and any missing Membership in every group together", async () => {
      const [board, sexmasteri] = [await newGroup("Board"), await newGroup("Sexmästeri")]
      const sexmastare = await t.positionId("Sexmästare")
      const userId = await member(board)

      expectSuccess(
        await startLinkedPosition(t.db, {
          userId,
          positionId: sexmastare,
          groupIds: [board, sexmasteri],
          startDate: "2025-07-01"
        })
      )

      expect((await getCurrentPositionHolder(t.db, board, sexmastare))?.userId).toBe(userId)
      expect((await getCurrentPositionHolder(t.db, sexmasteri, sexmastare))?.userId).toBe(userId)
      const memberships = await t.db.select().from(groupMember).where(eq(groupMember.userId, userId))
      expect(memberships.map(({ groupId }) => groupId).sort()).toEqual([board, sexmasteri].sort())
    })

    test("starts nothing when any group refuses", async () => {
      const [board, sexmasteri] = [await newGroup("Board"), await newGroup("Sexmästeri")]
      const sexmastare = await t.positionId("Sexmästare")
      const incumbent = await member(sexmasteri)
      expectSuccess(
        await startPositionHolding(t.db, {
          userId: incumbent,
          groupId: sexmasteri,
          positionId: sexmastare,
          startDate: "2025-01-01"
        })
      )
      const userId = await t.user()

      expect(
        await startLinkedPosition(t.db, {
          userId,
          positionId: sexmastare,
          groupIds: [board, sexmasteri],
          startDate: "2025-07-01"
        })
      ).toEqual({ success: false, error: "position-taken" })
      expect(await t.db.select().from(groupMember).where(eq(groupMember.userId, userId))).toEqual([])
      expect(await t.db.select().from(positionHolder).where(eq(positionHolder.userId, userId))).toEqual([])
    })

    test("ends the Position in every group together, leaving Memberships", async () => {
      const [board, sexmasteri] = [await newGroup("Board"), await newGroup("Sexmästeri")]
      const sexmastare = await t.positionId("Sexmästare")
      const userId = await t.user()
      const groupIds = [board, sexmasteri]
      expectSuccess(
        await startLinkedPosition(t.db, { userId, positionId: sexmastare, groupIds, startDate: "2025-07-01" })
      )

      expectSuccess(await endLinkedPosition(t.db, { userId, positionId: sexmastare, groupIds, endDate: "2026-06-30" }))

      expect(await getCurrentPositionHolder(t.db, board, sexmastare)).toBeNull()
      expect(await getCurrentPositionHolder(t.db, sexmasteri, sexmastare)).toBeNull()
      const memberships = await t.db.select().from(groupMember).where(eq(groupMember.userId, userId))
      expect(memberships.map(({ endDate }) => endDate)).toEqual([null, null])
    })
  })
})
