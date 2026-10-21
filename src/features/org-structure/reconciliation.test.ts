import { afterAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { startLinkedPosition } from "./linked-positions"
import { placeSinger } from "./membership"
import { endPositionHolding, startPositionHolding } from "./positions"
import { inventoryOrganisation } from "./reconciliation"
import { createGroup, createPosition } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess, uniqueName } from "./test-support"

const t = await createOrgStructureTestDatabase()
describe.skipIf(!t)("read-only organisation reconciliation", () => {
  afterAll(async () => {
    await t?.drop()
  })
  test("reports uncertain years, unsupported titles and direct-member intent without changing legacy data", async () => {
    if (!t) throw new Error("Missing test database")
    const board = expectSuccess(await createGroup(t.db, { name: "Styret 26/27", type: "Board" }))
    expectSuccess(await createGroup(t.db, { name: "Other board 26/27", type: "Board" }))
    const unsupported = expectSuccess(await createPosition(t.db, { name: "Webbansvarig", groupTypes: ["Board"] }))
    const userId = await t.user()
    await t.legacyMember({ userId, groupId: board.id, startDate: "2026-07-01" })
    expectSuccess(
      await startPositionHolding(t.db, {
        userId,
        groupId: board.id,
        positionId: unsupported.id,
        startDate: "2026-07-01"
      })
    )
    const helperGroup = expectSuccess(await createGroup(t.db, { name: uniqueName("Unknown year"), type: "Sexmästeri" }))
    await t.legacyMember({ userId, groupId: helperGroup.id, startDate: "2026-07-01" })
    const first = await inventoryOrganisation(t.db)
    expect(first.unsupportedPositions).toContainEqual({ positionId: unsupported.id, name: "Webbansvarig" })
    expect(first.ambiguousYears).toContainEqual(expect.objectContaining({ groupId: helperGroup.id }))
    expect(first.duplicateSingletons).toContainEqual(
      expect.objectContaining({ type: "Board", organisationYear: 2026, groupIds: expect.arrayContaining([board.id]) })
    )
    expect(first.directMemberIntent).toContainEqual(
      expect.objectContaining({ userId, groupId: helperGroup.id, reason: "helper-intent-unconfirmed" })
    )
    expect(await inventoryOrganisation(t.db)).toEqual(first)
  })
  test("reports partial linked holdings and retains same-title Choir duties as independent context evidence", async () => {
    if (!t) throw new Error("Missing test database")
    const board = expectSuccess(await createGroup(t.db, { name: "Board 36/37", type: "Board" }))
    const committee = expectSuccess(await createGroup(t.db, { name: "Sexmästeriet 36/37", type: "Sexmästeri" }))
    const userId = await t.user()
    const positionId = await t.positionId("Sexmästare")
    expectSuccess(
      await startLinkedPosition(t.db, {
        userId,
        positionId,
        groupIds: [board.id, committee.id],
        startDate: "2036-07-01"
      })
    )
    const paired = (await inventoryOrganisation(t.db)).linkedHoldings.find(
      (row) => row.contextHolding.userId === userId
    )
    expect(paired).toMatchObject({ status: "paired-candidate-requires-review", mergeApproved: false })
    expectSuccess(await endPositionHolding(t.db, { userId, positionId, groupId: committee.id, endDate: "2037-01-01" }))
    for (const [choir, voice] of [
      ["MK", "T1"],
      ["DK", "S1"]
    ] as const) {
      const groupId = await t.groupId(choir)
      expectSuccess(await placeSinger(t.db, { userId, choirId: groupId, voice, startDate: "2036-07-01" }))
      expectSuccess(
        await startPositionHolding(t.db, {
          userId,
          groupId,
          positionId: await t.positionId("Konsertmästare"),
          startDate: "2036-07-01"
        })
      )
    }
    const report = await t.db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`)
      return inventoryOrganisation(tx)
    })
    expect(
      report.linkedHoldings.find(
        (row) => row.contextHolding.userId === userId && row.contextHolding.groupId === board.id
      )
    ).toMatchObject({ status: "partial-or-ambiguous", mergeApproved: false })
    expect(
      report.holdingEvidence.filter((row) => row.userId === userId && row.contextCodes.includes("choir-konsertmastare"))
    ).toHaveLength(2)
    expect(
      report.linkedHoldings.filter(
        (row) =>
          row.contextHolding.userId === userId && row.contextHolding.contextCodes.includes("choir-konsertmastare")
      )
    ).toHaveLength(2)
    expect(await inventoryOrganisation(t.db)).toEqual(report)
  })
})
