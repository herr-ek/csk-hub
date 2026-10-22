import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { Client } from "pg"
import { choir, group, section } from "@/core/db/schema/org-structure"
import { GroupType } from "@/core/org-structure"
import { createTestDatabase } from "../../test/database"
import { createReferenceData, insertReferenceData, REFERENCE_DATA } from "./reference-data"

const database = await createTestDatabase()

describe.skipIf(!database)("reference data", () => {
  const t = database as NonNullable<typeof database>
  beforeAll(() => setSystemTime(new Date("2026-10-22T12:00:00Z")))
  afterAll(async () => {
    setSystemTime()
    await t.drop()
  })

  async function withClient<T>(work: (client: Client) => Promise<T>) {
    const client = new Client({ connectionString: t.url })
    await client.connect()
    try {
      return await work(client)
    } finally {
      await client.end()
    }
  }

  test("creates Choirs, Sections, continuing parents and explicit current and future Groups", async () => {
    const created = await withClient(insertReferenceData)
    expect(created).toContain("KKB")
    expect(created).toContain(GroupType.ParentsMeeting)

    for (const definition of REFERENCE_DATA.choirs) {
      const [choirRow] = await t.db
        .select({ id: group.id })
        .from(group)
        .where(and(eq(group.name, definition.name), eq(group.type, GroupType.Choir)))
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

    for (const { type } of REFERENCE_DATA.continuingGroups) {
      const [row] = await t.db.select().from(group).where(eq(group.type, type))
      expect(row).toMatchObject({ type, choirId: null, name: null })
    }
    for (const year of [2026, 2027]) {
      for (const item of REFERENCE_DATA.annualGroups(year)) {
        const [row] = await t.db
          .select()
          .from(group)
          .where(and(eq(group.type, item.type as never), eq(group.organisationYear, year)))
        expect(row).toMatchObject({ name: null, organisationYear: year })
      }
    }
  })

  test("is safe to run again", async () => {
    expect(await withClient(insertReferenceData)).toEqual([])
    expect(await createReferenceData({ target: "local", url: t.url, host: "test" }, { skipConfirmation: false })).toBe(
      0
    )
    expect(await t.db.select().from(group)).toHaveLength(
      REFERENCE_DATA.choirs.length +
        REFERENCE_DATA.choirs.reduce((total, item) => total + item.sections.length, 0) +
        REFERENCE_DATA.continuingGroups.length +
        20
    )
  })

  test("live reference data rolls forward at local July 1 while retaining history", async () => {
    setSystemTime(new Date("2027-06-30T21:59:00Z"))
    expect(await withClient(insertReferenceData)).toEqual([])
    setSystemTime(new Date("2027-06-30T22:00:00Z"))
    expect(await withClient(insertReferenceData)).toHaveLength(REFERENCE_DATA.annualGroups(2028).length)
    const annual = (await t.db.select().from(group)).filter(({ organisationYear }) => organisationYear !== null)
    expect([...new Set(annual.map(({ organisationYear }) => organisationYear))].sort()).toEqual([2026, 2027, 2028])
    expect(await withClient(insertReferenceData)).toEqual([])
  })
})
