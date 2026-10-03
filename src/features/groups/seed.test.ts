import { afterAll, describe, expect, test } from "bun:test"
import { listCurrentGroupsOfUser } from "./reads"
import { seedGroups } from "./seed"
import { createGroupsTestDatabase } from "./test-support"

const database = await createGroupsTestDatabase()

describe.skipIf(!database)("seedGroups", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("adds the example groups and places every unplaced user in a Section, once", async () => {
    const [first, second] = [await t.user(), await t.user()]

    const { created, placed } = await seedGroups(t.db)
    expect(created).toContain("Sexmästeri")
    expect(created).toContain("KK roddgrupp")
    expect(placed).toBe(2)
    for (const userId of [first, second]) {
      const types = (await listCurrentGroupsOfUser(t.db, userId)).map(({ type }) => type).sort()
      expect(types).toEqual(["Choir", "Section"])
    }

    expect(await seedGroups(t.db)).toEqual({ created: [], placed: 0 })
  })
})
