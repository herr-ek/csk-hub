import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { GroupType, PositionCode } from "@/core/org-structure"
import { appointPosition, createOrganisationGroup } from "./appointments"
import { addDirectMembership } from "./direct-membership"
import { listPositionHistoryYears, listPositionOverview } from "./position-overview"
import { archiveGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()

describe.skipIf(!database)("organisation-wide Position overview", () => {
  const t = database as NonNullable<typeof database>
  let board: string, choir: string, archivedGig: string, former: string, successor: string, librarian: string
  afterAll(() => t.drop())
  beforeAll(async () => {
    expect(await listPositionHistoryYears(t.db, "2026-10-22")).toEqual([2026])
    board = expectSuccess(await createOrganisationGroup(t.db, { type: GroupType.Board, organisationYear: 2026 })).id
    const concert = expectSuccess(
      await createOrganisationGroup(t.db, { type: GroupType.ConcertCommittee, organisationYear: 2026 })
    ).id
    former = await t.user("Former holder")
    successor = await t.user("Successor")
    librarian = await t.user("Returning librarian")
    for (const [userId, startDate, endDate] of [
      [former, "2026-07-01", "2026-09-01"],
      [successor, "2026-09-01", "2027-07-01"]
    ] as const) {
      expectSuccess(
        await appointPosition(t.db, {
          userId,
          positionCode: PositionCode.Chair,
          contextGroupId: board,
          startDate,
          endDate
        })
      )
    }
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user("Board concert master"),
        positionCode: PositionCode.FirstConcertMaster,
        contextGroupId: board,
        startDate: "2026-07-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user("Prepared treasurer"),
        positionCode: PositionCode.Treasurer,
        contextGroupId: board,
        startDate: "2027-01-01"
      })
    )
    expect(concert).toBeDefined()
    choir = await t.groupId("MK")
    for (const userId of [former, successor, librarian])
      expectSuccess(await addDirectMembership(t.db, { userId, groupId: choir, startDate: "2020-01-01" }))
    expectSuccess(
      await appointPosition(t.db, {
        userId: former,
        positionCode: PositionCode.Conductor,
        contextGroupId: choir,
        startDate: "2024-01-01",
        endDate: "2025-01-01"
      })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: successor,
        positionCode: PositionCode.Conductor,
        contextGroupId: choir,
        startDate: "2025-01-01"
      })
    )
    for (const [startDate, endDate] of [
      ["2024-01-01", "2024-07-01"],
      ["2025-07-01", "2025-09-01"],
      ["2025-11-01", null]
    ] as const) {
      expectSuccess(
        await appointPosition(t.db, {
          userId: librarian,
          positionCode: PositionCode.MusicLibrarian,
          contextGroupId: choir,
          startDate,
          endDate
        })
      )
    }
    archivedGig = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Archived overview ensemble", type: GroupType.GigGroup })
    ).id
    const leader = await t.user("Retained leader")
    expectSuccess(await addDirectMembership(t.db, { userId: leader, groupId: archivedGig, startDate: "2024-01-01" }))
    expectSuccess(
      await appointPosition(t.db, {
        userId: leader,
        positionCode: PositionCode.GigLeader,
        contextGroupId: archivedGig,
        startDate: "2024-01-01"
      })
    )
    expectSuccess(await archiveGroup(t.db, archivedGig))
  })

  test("current means today's holder, excludes prepared tenures and archived contexts, and never duplicates grants", async () => {
    const contexts = await listPositionOverview(t.db, "2026-10-22")
    const currentBoard = contexts.find(({ group }) => group.id === board)
    expect(currentBoard?.positions.map(({ code }) => code)).toEqual([
      PositionCode.Chair,
      PositionCode.FirstConcertMaster
    ])
    expect(currentBoard?.positions.find(({ code }) => code === PositionCode.Chair)?.holders).toMatchObject([
      { userId: successor }
    ])
    expect(contexts.some(({ group }) => group.type === GroupType.ConcertCommittee)).toBe(false)
    expect(contexts.some(({ group }) => group.id === archivedGig)).toBe(false)
    expect(contexts.find(({ group }) => group.id === choir)?.positions).toHaveLength(2)
  })

  test("year history lists both annual and fluid handover holders under their Position", async () => {
    const currentYear = await listPositionOverview(t.db, "2026-10-22", 2026)
    expect(
      currentYear
        .find(({ group }) => group.id === board)
        ?.positions.find(({ code }) => code === PositionCode.Chair)
        ?.holders.map(({ userId }) => userId)
    ).toEqual([former, successor])
    expect(
      currentYear.find(({ group }) => group.id === board)?.positions.some(({ code }) => code === PositionCode.Treasurer)
    ).toBe(false)
    const history = await listPositionOverview(t.db, "2026-10-22", 2024)
    expect(
      history
        .find(({ group }) => group.id === choir)
        ?.positions.find(({ code }) => code === PositionCode.Conductor)
        ?.holders.map(({ userId }) => userId)
    ).toEqual([former, successor])
    expect(history.find(({ group }) => group.id === archivedGig)?.positions[0]?.code).toBe(PositionCode.GigLeader)
  })

  test("July boundaries are exclusive; a returning person is listed once with both periods", async () => {
    const boundary = await listPositionOverview(t.db, "2025-07-01", 2024)
    expect(
      boundary
        .find(({ group }) => group.id === choir)
        ?.positions.some(({ code }) => code === PositionCode.MusicLibrarian)
    ).toBe(false)
    const history = await listPositionOverview(t.db, "2026-10-22", 2025)
    const holders = history
      .find(({ group }) => group.id === choir)
      ?.positions.find(({ code }) => code === PositionCode.MusicLibrarian)?.holders
    expect(holders).toHaveLength(1)
    expect(holders?.[0]).toMatchObject({
      userId: librarian,
      periods: [
        { startDate: "2025-07-01", endDate: "2025-09-01" },
        { startDate: "2025-11-01", endDate: null }
      ]
    })
    expect(await listPositionHistoryYears(t.db, "2026-10-22")).toEqual([2026, 2025, 2024, 2023])
    await expect(listPositionOverview(t.db, "2026-10-22", 2027)).rejects.toThrow(RangeError)
  })
})
