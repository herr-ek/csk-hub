import { afterAll, describe, expect, test } from "bun:test"
import { and, eq, isNull } from "drizzle-orm"
import { Client } from "pg"
import { user } from "@/core/db/schema/auth"
import { group, groupMember } from "@/core/db/schema/org-structure"
import { createTestDatabase } from "../test/database"
import { insertReferenceData } from "./ops/reference-data"
import { seedGroups } from "./seed-groups"

const database = await createTestDatabase()

describe.skipIf(!database)("seedGroups", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function newUser() {
    const id = crypto.randomUUID()
    await t.db.insert(user).values({ id, name: "Singer", email: `${id}@example.com` })
    return id
  }

  test("refuses to run before the reference data exists", async () => {
    await expect(seedGroups(t.db)).rejects.toThrow("bun run ops reference-data")
  })

  test("adds the example groups and places every unplaced user in a Choir and a Section, once", async () => {
    const client = new Client({ connectionString: t.url })
    await client.connect()
    await insertReferenceData(client)
    await client.end()
    const users = [await newUser(), await newUser()]

    const { created, placed } = await seedGroups(t.db)
    expect(created).toContain("Sexmästeri")
    expect(created).toContain("KK roddgrupp")
    expect(placed).toBe(2)

    for (const userId of users) {
      const rows = await t.db
        .select({ type: group.type, voice: groupMember.voice })
        .from(groupMember)
        .innerJoin(group, eq(group.id, groupMember.groupId))
        .where(and(eq(groupMember.userId, userId), isNull(groupMember.endDate)))
      expect(rows.map(({ type }) => type).sort()).toEqual(["Choir", "Section"])
      // Every seeded singer gets a division, even in a Section that sings a whole family.
      expect(rows.find(({ type }) => type === "Section")?.voice).toMatch(/^[SATB][12]$/)
    }

    expect(await seedGroups(t.db)).toEqual({ created: [], placed: 0 })
  })
})
