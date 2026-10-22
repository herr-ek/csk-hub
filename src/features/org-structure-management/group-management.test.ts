import { afterAll, describe, expect, test } from "bun:test"
import { GroupType, PositionCode } from "@/core/org-structure"
import {
  appointPosition,
  createOrganisationGroup,
  listAppointmentMembersAt,
  listAppointmentsForGroup
} from "./appointments"
import { addDirectMembership, listDirectMemberships } from "./direct-membership"
import { listOrganisationGroups, prepareOrganisationYear, updateOrganisationGroup } from "./group-management"
import { archiveGroup, renameGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("concrete Group management", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("prepares distinct annual sets atomically and idempotently without participation", async () => {
    const first = expectSuccess(await prepareOrganisationYear(t.db, 2026, "4000-10-22"))
    expect(first).toHaveLength(10)
    expect(expectSuccess(await prepareOrganisationYear(t.db, 2026, "4000-10-22"))).toEqual(first)
    const sexmasteri = first.find((row) => row.type === GroupType.SocialCommittee) as { id: string }
    const board = first.find((row) => row.type === GroupType.Board) as { id: string }
    const helperId = await t.user()
    expectSuccess(
      await addDirectMembership(t.db, { userId: helperId, groupId: sexmasteri.id, startDate: "2026-09-01" })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user(),
        positionCode: PositionCode.SocialCoordinator,
        contextGroupId: board.id,
        startDate: "2026-09-01"
      })
    )
    expectSuccess(await prepareOrganisationYear(t.db, 2026, "4000-10-22"))
    expect(await listDirectMemberships(t.db, sexmasteri.id)).toMatchObject([{ userId: helperId }])
    const next = expectSuccess(await prepareOrganisationYear(t.db, 2027, "4000-10-22"))
    for (const row of next) {
      expect(await listDirectMemberships(t.db, row.id)).toEqual([])
      expect(await listAppointmentMembersAt(t.db, row.id, "2027-09-01")).toEqual([])
    }
    expect(next).toHaveLength(10)
    expect(next.some((row) => first.some((other) => other.id === row.id))).toBe(false)
    const rows = await listOrganisationGroups(t.db, "2027-06-30")
    expect(rows.find((row) => row.id === first[0]?.id)?.phase).toBe("current")
    expect(rows.find((row) => row.id === next[0]?.id)?.phase).toBe("future")
    expect((await listOrganisationGroups(t.db, "2027-07-01")).find((row) => row.id === first[0]?.id)?.phase).toBe(
      "completed"
    )
  })
  test("derived names cannot be overridden and occupied structural corrections refuse atomically", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Editable web", type: GroupType.WebTeam, organisationYear: 2031 },
        "4000-10-22"
      )
    ).id
    expectSuccess(await addDirectMembership(t.db, { userId: await t.user(), groupId, startDate: "2031-09-01" }))
    expectSuccess(
      await updateOrganisationGroup(
        t.db,
        {
          groupId,
          name: "Web 31/32",
          type: GroupType.WebTeam,
          organisationYear: 2031
        },
        "4000-10-22"
      )
    )
    expect(await renameGroup(t.db, groupId, "Renamed web")).toEqual({ success: false, error: "group-name-derived" })
    const before = await listDirectMemberships(t.db, groupId)
    expect(
      await updateOrganisationGroup(
        t.db,
        {
          groupId,
          name: "Wrong edit",
          type: GroupType.WebTeam,
          organisationYear: 2032
        },
        "4000-10-22"
      )
    ).toEqual({ success: false, error: "group-has-participation" })
    expect((await listOrganisationGroups(t.db, "2031-09-01")).find((row) => row.id === groupId)).toMatchObject({
      name: null,
      organisationYear: 2031
    })
    expect(await listDirectMemberships(t.db, groupId)).toEqual(before)
  })

  test("empty concrete Groups can change type, scope and year under fixed policies", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Empty gig", type: GroupType.GigGroup }, "4000-10-22")
    ).id
    expectSuccess(
      await updateOrganisationGroup(
        t.db,
        {
          groupId,
          name: "Future archive",
          type: GroupType.Archives,
          organisationYear: 2037
        },
        "4000-10-22"
      )
    )
    expect(
      await updateOrganisationGroup(
        t.db,
        {
          groupId,
          name: "Wrong scope",
          type: GroupType.Archives,
          organisationYear: 2037,
          choirId: await t.groupId("MK")
        },
        "4000-10-22"
      )
    ).toEqual({ success: false, error: "invalid-group-scope" })
    expect(
      await createOrganisationGroup(t.db, { name: "Parallel gig one", type: GroupType.GigGroup }, "4000-10-22")
    ).toMatchObject({
      success: true
    })
    expect(
      await createOrganisationGroup(t.db, { name: "Parallel gig two", type: GroupType.GigGroup }, "4000-10-22")
    ).toMatchObject({
      success: true
    })
    const choirId = await t.groupId("MK")
    expectSuccess(
      await createOrganisationGroup(t.db, { name: "One rodd", type: GroupType.EquipmentTeam, choirId }, "4000-10-22")
    )
    expect(
      await createOrganisationGroup(t.db, { name: "Second rodd", type: GroupType.EquipmentTeam, choirId }, "4000-10-22")
    ).toMatchObject({
      success: false
    })
  })

  test("archival preserves a future appointment and its prerequisite membership", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Protected gig", type: GroupType.GigGroup }, "4000-10-22")
    ).id
    const userId = await t.user()
    expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2030-01-01" }))
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: PositionCode.GigLeader,
        contextGroupId: groupId,
        startDate: "2030-02-01"
      })
    )
    const before = await listDirectMemberships(t.db, groupId)
    expectSuccess(await archiveGroup(t.db, groupId))
    expect((await listOrganisationGroups(t.db, "2030-02-01")).find((row) => row.id === groupId)?.active).toBe(false)
    expect(await listDirectMemberships(t.db, groupId)).toEqual(before)
    expect(await listAppointmentsForGroup(t.db, groupId)).toMatchObject([
      { userId, startDate: "2030-02-01", endDate: null }
    ])
  })
  test("annual identities cannot be manually archived and concurrent preparations reuse them", async () => {
    const existing = expectSuccess(
      await createOrganisationGroup(t.db, { type: GroupType.SocialCommittee, organisationYear: 2042 }, "4000-10-22")
    )
    expect(await archiveGroup(t.db, existing.id)).toEqual({ success: false, error: "annual-group-lifecycle-derived" })
    const prepared = expectSuccess(await prepareOrganisationYear(t.db, 2042, "4000-10-22"))
    expect(prepared.find(({ type }) => type === GroupType.SocialCommittee)?.id).toBe(existing.id)
    for (const [date, phase] of [
      ["2042-06-30", "future"],
      ["2042-07-01", "current"],
      ["2043-07-01", "completed"]
    ] as const) {
      expect((await listOrganisationGroups(t.db, date)).find(({ id }) => id === existing.id)).toMatchObject({
        active: true,
        phase
      })
    }
    const [first, second] = await Promise.all([
      prepareOrganisationYear(t.db, 2043, "4000-10-22"),
      prepareOrganisationYear(t.db, 2043, "4000-10-22")
    ])
    expect(expectSuccess(first)).toEqual(expectSuccess(second))
  })
  test("Choir-team cardinality excludes archived Groups", async () => {
    const choirId = await t.groupId("DK")
    const existingId = expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "DK rephelg", type: GroupType.RehearsalWeekendTeam, choirId },
        "4000-10-22"
      )
    ).id
    expect(
      await createOrganisationGroup(
        t.db,
        { name: "New DK rephelg", type: GroupType.RehearsalWeekendTeam, choirId },
        "4000-10-22"
      )
    ).toEqual({
      success: false,
      error: "group-type-taken"
    })
    const editableId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Candidate gig", type: GroupType.GigGroup }, "4000-10-22")
    ).id
    expect(
      await updateOrganisationGroup(
        t.db,
        {
          groupId: editableId,
          name: "Edited DK rephelg",
          type: GroupType.RehearsalWeekendTeam,
          choirId
        },
        "4000-10-22"
      )
    ).toEqual({ success: false, error: "group-type-taken" })
    expect((await listOrganisationGroups(t.db, "2026-10-21")).find((row) => row.id === editableId)).toMatchObject({
      name: "Candidate gig",
      type: GroupType.GigGroup,
      choirId: null
    })
    expectSuccess(await archiveGroup(t.db, existingId))
    expectSuccess(
      await updateOrganisationGroup(
        t.db,
        {
          groupId: editableId,
          name: "Edited DK rephelg",
          type: GroupType.RehearsalWeekendTeam,
          choirId
        },
        "4000-10-22"
      )
    )
  })
  test("concurrent Choir-team creation and reclassification have one winner", async () => {
    const choirId = await t.groupId("DK")
    const candidate = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Racing candidate gig", type: GroupType.GigGroup }, "4000-10-22")
    )
    const results = await Promise.all([
      createOrganisationGroup(
        t.db,
        { name: "Racing rodd creation", type: GroupType.EquipmentTeam, choirId },
        "4000-10-22"
      ),
      updateOrganisationGroup(
        t.db,
        {
          groupId: candidate.id,
          name: "Racing rodd edit",
          type: GroupType.EquipmentTeam,
          choirId
        },
        "4000-10-22"
      )
    ])
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "group-type-taken" })
    expect(
      (await listOrganisationGroups(t.db, "2026-10-21")).filter(
        (row) => row.active && row.type === GroupType.EquipmentTeam && row.choirId === choirId
      )
    ).toHaveLength(1)
  })
})

const windowDatabase = await createOrgStructureTestDatabase()
describe.skipIf(!windowDatabase)("annual preparation window", () => {
  const t = windowDatabase as NonNullable<typeof windowDatabase>
  afterAll(() => t.drop())
  test("July rollover opens exactly one following year and failed preparation leaves no groups", async () => {
    expect(await prepareOrganisationYear(t.db, 2028, "2027-06-30")).toEqual({
      success: false,
      error: "organisation-year-too-far-ahead"
    })
    expect((await listOrganisationGroups(t.db, "2027-06-30")).filter((row) => row.organisationYear === 2028)).toEqual(
      []
    )
    expectSuccess(await prepareOrganisationYear(t.db, 2028, "2027-07-01"))
    expect(
      await createOrganisationGroup(
        t.db,
        { name: "Too early", type: GroupType.Board, organisationYear: 2030 },
        "2027-07-01"
      )
    ).toEqual({ success: false, error: "organisation-year-too-far-ahead" })
    const gig = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Window test gig", type: GroupType.GigGroup }, "2027-07-01")
    )
    expect(
      await updateOrganisationGroup(
        t.db,
        { groupId: gig.id, name: "Too early edit", type: GroupType.Board, organisationYear: 2030 },
        "2027-07-01"
      )
    ).toEqual({ success: false, error: "organisation-year-too-far-ahead" })
    expectSuccess(
      await createOrganisationGroup(
        t.db,
        { name: "Historical Board", type: GroupType.Board, organisationYear: 2001 },
        "2027-07-01"
      )
    )
  })
})
