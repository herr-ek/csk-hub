import { afterAll, describe, expect, mock, test } from "bun:test"
import { createEvent } from "../../events"
import { createEventsTestDatabase, eventInput, expectSuccess } from "../../test-support"

const database = await createEventsTestDatabase()
mock.module("@/core/db", () => ({ db: database?.db }))

const { listAdminEvents } = await import("./query")

describe.skipIf(!database)("the admin Events list", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("names the Organiser group and the Target groups, archived or not, in name order", async () => {
    const choir = await t.choir()
    const organiser = await t.group("Board")
    const { id } = expectSuccess(
      await createEvent(t.db, {
        ...eventInput({
          organiserGroupId: organiser,
          targets: [
            { groupId: null, voiceFamily: "S" },
            { groupId: choir, voiceFamily: "B" },
            { groupId: organiser, voiceFamily: null },
            { groupId: choir, voiceFamily: "A" }
          ]
        }),
        createdBy: null
      })
    )
    await t.archiveGroup(organiser)

    const rows = await listAdminEvents({ when: "upcoming" }, new Date("2026-01-01T00:00:00Z"))
    const row = rows.find((candidate) => candidate.id === id)

    expect(row?.organiserGroup).toStartWith("Board ")
    expect(row?.targets.map(({ group, voiceFamily }) => [group?.split(" ")[0] ?? null, voiceFamily])).toEqual([
      ["Board", null],
      ["Choir", "A"],
      ["Choir", "B"],
      [null, "S"]
    ])
  })

  test("leaves the Organiser group empty when the Event has none", async () => {
    const { id } = expectSuccess(await createEvent(t.db, { ...eventInput(), createdBy: null }))
    const rows = await listAdminEvents({ when: "upcoming" }, new Date("2026-01-01T00:00:00Z"))
    expect(rows.find((candidate) => candidate.id === id)).toMatchObject({ organiserGroup: null, targets: [] })
  })
})
