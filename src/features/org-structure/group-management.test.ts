import { afterAll, describe, expect, test } from "bun:test"
import { appointPosition, createOrganisationGroup, listAppointmentMembersAt } from "./appointments"
import { addDirectMembership, listDirectMemberships } from "./direct-membership"
import { listOrganisationGroups, prepareOrganisationYear, updateOrganisationGroup } from "./group-management"
import { archiveGroup } from "./structure"
import { createOrgStructureTestDatabase, expectSuccess } from "./test-support"

const database = await createOrgStructureTestDatabase()
describe.skipIf(!database)("concrete Group management", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("prepares distinct annual sets atomically and idempotently without participation", async () => {
    const first = expectSuccess(await prepareOrganisationYear(t.db, 2026))
    expect(first).toHaveLength(10)
    expect(expectSuccess(await prepareOrganisationYear(t.db, 2026))).toEqual(first)
    const sexmasteri = first.find((row) => row.type === "Sexmästeri") as { id: string }
    const board = first.find((row) => row.type === "Board") as { id: string }
    const helperId = await t.user()
    expectSuccess(
      await addDirectMembership(t.db, { userId: helperId, groupId: sexmasteri.id, startDate: "2026-09-01" })
    )
    expectSuccess(
      await appointPosition(t.db, {
        userId: await t.user(),
        positionCode: "sexmastare",
        contextGroupId: board.id,
        startDate: "2026-09-01"
      })
    )
    expectSuccess(await prepareOrganisationYear(t.db, 2026))
    expect(await listDirectMemberships(t.db, sexmasteri.id)).toMatchObject([{ userId: helperId }])
    const next = expectSuccess(await prepareOrganisationYear(t.db, 2027))
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
  test("an occupied Group can be renamed but a structural correction refuses atomically", async () => {
    const groupId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Editable web", type: "Webmästeri", organisationYear: 2031 })
    ).id
    expectSuccess(await addDirectMembership(t.db, { userId: await t.user(), groupId, startDate: "2031-09-01" }))
    expectSuccess(
      await updateOrganisationGroup(t.db, { groupId, name: "Web 31/32", type: "Webmästeri", organisationYear: 2031 })
    )
    const before = await listDirectMemberships(t.db, groupId)
    expect(
      await updateOrganisationGroup(t.db, { groupId, name: "Wrong edit", type: "Webmästeri", organisationYear: 2032 })
    ).toEqual({ success: false, error: "group-has-participation" })
    expect((await listOrganisationGroups(t.db, "2031-09-01")).find((row) => row.id === groupId)).toMatchObject({
      name: "Web 31/32",
      organisationYear: 2031
    })
    expect(await listDirectMemberships(t.db, groupId)).toEqual(before)
  })

  test("empty concrete Groups can change type, scope and year under fixed policies", async () => {
    const groupId = expectSuccess(await createOrganisationGroup(t.db, { name: "Empty gig", type: "GigGroup" })).id
    expectSuccess(
      await updateOrganisationGroup(t.db, {
        groupId,
        name: "Future archive",
        type: "Arkivarie",
        organisationYear: 2037
      })
    )
    expect(
      await updateOrganisationGroup(t.db, {
        groupId,
        name: "Wrong scope",
        type: "Arkivarie",
        organisationYear: 2037,
        choirId: await t.groupId("MK")
      })
    ).toEqual({ success: false, error: "invalid-group-scope" })
    expect(await createOrganisationGroup(t.db, { name: "Parallel gig one", type: "GigGroup" })).toMatchObject({
      success: true
    })
    expect(await createOrganisationGroup(t.db, { name: "Parallel gig two", type: "GigGroup" })).toMatchObject({
      success: true
    })
    const choirId = await t.groupId("MK")
    expectSuccess(await createOrganisationGroup(t.db, { name: "One rodd", type: "Roddgrupp", choirId }))
    expect(await createOrganisationGroup(t.db, { name: "Second rodd", type: "Roddgrupp", choirId })).toMatchObject({
      success: false
    })
  })

  test("archival cannot strand a future appointment prerequisite", async () => {
    const groupId = expectSuccess(await createOrganisationGroup(t.db, { name: "Protected gig", type: "GigGroup" })).id
    const userId = await t.user()
    expectSuccess(await addDirectMembership(t.db, { userId, groupId, startDate: "2030-01-01" }))
    expectSuccess(
      await appointPosition(t.db, {
        userId,
        positionCode: "gigledare",
        contextGroupId: groupId,
        startDate: "2030-02-01"
      })
    )
    expect(await archiveGroup(t.db, groupId)).toEqual({ success: false, error: "membership-dependency" })
    expect((await listOrganisationGroups(t.db, "2030-02-01")).find((row) => row.id === groupId)?.active).toBe(true)
  })
  test("preparation rolls back its whole set on a conflicting name and concurrent retries reuse identities", async () => {
    expectSuccess(await createOrganisationGroup(t.db, { name: "Sexmästeriet 42/43", type: "Övrig" }))
    expect(await prepareOrganisationYear(t.db, 2042)).toEqual({ success: false, error: "group-name-taken" })
    expect((await listOrganisationGroups(t.db, "2042-09-01")).filter((row) => row.organisationYear === 2042)).toEqual(
      []
    )
    const [first, second] = await Promise.all([
      prepareOrganisationYear(t.db, 2043),
      prepareOrganisationYear(t.db, 2043)
    ])
    expect(expectSuccess(first)).toEqual(expectSuccess(second))
  })
  test("Choir-team cardinality excludes archived Groups", async () => {
    const choirId = await t.groupId("DK")
    const existingId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "DK rephelg", type: "Rephelg", choirId })
    ).id
    expect(await createOrganisationGroup(t.db, { name: "New DK rephelg", type: "Rephelg", choirId })).toEqual({
      success: false,
      error: "group-type-taken"
    })
    const editableId = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Candidate gig", type: "GigGroup" })
    ).id
    expect(
      await updateOrganisationGroup(t.db, { groupId: editableId, name: "Edited DK rephelg", type: "Rephelg", choirId })
    ).toEqual({ success: false, error: "group-type-taken" })
    expect((await listOrganisationGroups(t.db, "2026-10-21")).find((row) => row.id === editableId)).toMatchObject({
      name: "Candidate gig",
      type: "GigGroup",
      choirId: null
    })
    expectSuccess(await archiveGroup(t.db, existingId))
    expectSuccess(
      await updateOrganisationGroup(t.db, { groupId: editableId, name: "Edited DK rephelg", type: "Rephelg", choirId })
    )
  })
  test("concurrent Choir-team creation and reclassification have one winner", async () => {
    const choirId = await t.groupId("DK")
    const candidate = expectSuccess(
      await createOrganisationGroup(t.db, { name: "Racing candidate gig", type: "GigGroup" })
    )
    const results = await Promise.all([
      createOrganisationGroup(t.db, { name: "Racing rodd creation", type: "Roddgrupp", choirId }),
      updateOrganisationGroup(t.db, { groupId: candidate.id, name: "Racing rodd edit", type: "Roddgrupp", choirId })
    ])
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({ success: false, error: "group-type-taken" })
    expect(
      (await listOrganisationGroups(t.db, "2026-10-21")).filter(
        (row) => row.active && row.type === "Roddgrupp" && row.choirId === choirId
      )
    ).toHaveLength(1)
  })
})
