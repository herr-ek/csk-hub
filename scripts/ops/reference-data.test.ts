import { afterAll, describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { Client } from "pg"
import { choir, group, groupTypePosition, position, section } from "@/core/db/schema/org-structure"
import { createTestDatabase } from "../../test/database"
import { createReferenceData, insertReferenceData, REFERENCE_DATA } from "./reference-data"

const database = await createTestDatabase()

describe.skipIf(!database)("reference data", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function withClient<T>(work: (client: Client) => Promise<T>) {
    const client = new Client({ connectionString: t.url })
    await client.connect()
    try {
      return await work(client)
    } finally {
      await client.end()
    }
  }

  test("creates the Choirs, their Sections and Voices, the Board and the Positions", async () => {
    const created = await withClient(insertReferenceData)
    expect(created).toContain("KKB")
    expect(created).toContain("Stämförälder")

    for (const definition of REFERENCE_DATA.choirs) {
      const [choirRow] = await t.db
        .select({ id: group.id })
        .from(group)
        .where(and(eq(group.name, definition.name), eq(group.type, "Choir")))
      const sections = await t.db
        .select({ name: group.name, voice: section.voice })
        .from(section)
        .innerJoin(group, eq(group.id, section.groupId))
        .where(eq(group.choirId, choirRow?.id as string))
      expect(sections.map(({ name, voice }) => `${name}:${voice}`).sort()).toEqual(
        definition.sections.map(({ name, voice }) => `${name}:${voice}`).sort()
      )
    }
    expect(await t.db.select().from(choir)).toHaveLength(REFERENCE_DATA.choirs.length)

    for (const { name, type } of REFERENCE_DATA.groups) {
      const [row] = await t.db.select().from(group).where(eq(group.name, name))
      expect(row).toMatchObject({ type, choirId: null })
    }

    const allowed = await t.db
      .select({ name: position.name, type: groupTypePosition.type })
      .from(groupTypePosition)
      .innerJoin(position, eq(position.id, groupTypePosition.positionId))
    expect(allowed.map(({ name, type }) => `${name}:${type}`).sort()).toEqual(
      REFERENCE_DATA.positions.flatMap(({ name, groupTypes }) => groupTypes.map((type) => `${name}:${type}`)).sort()
    )
  })

  test("is safe to run again", async () => {
    expect(await withClient(insertReferenceData)).toEqual([])
    expect(await createReferenceData({ target: "local", url: t.url, host: "test" }, { skipConfirmation: false })).toBe(
      0
    )
    const sections = REFERENCE_DATA.choirs.flatMap(({ sections }) => sections)
    expect(await t.db.select().from(group)).toHaveLength(
      REFERENCE_DATA.choirs.length + sections.length + REFERENCE_DATA.groups.length
    )
  })
})
