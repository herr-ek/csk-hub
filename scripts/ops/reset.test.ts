import { afterAll, describe, expect, spyOn, test } from "bun:test"
import { sql } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { createTestDatabase } from "../../test/database"
import { readMigrations } from "./migration-status"
import { resetLocalDatabase } from "./reset"

const database = await createTestDatabase()

describe.skipIf(!database)("resetLocalDatabase", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("refuses production and any database that is not local", async () => {
    await t.db.insert(user).values({ id: "kept", name: "Kept", email: "kept@example.com" })

    const consoleError = spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(await resetLocalDatabase({ target: "prod", url: t.url, host: "prod" }, { skipConfirmation: true })).toBe(1)
      expect(
        await resetLocalDatabase(
          { target: "local", url: "postgresql://someone@db.example.com:5432/csk_hub", host: "remote" },
          { skipConfirmation: true }
        )
      ).toBe(1)
      expect(consoleError.mock.calls).toEqual([
        ["✖ Reset is local-only and needs POSTGRES_URL to point at a local database."],
        ["✖ Reset is local-only and needs POSTGRES_URL to point at a local database."]
      ])
    } finally {
      consoleError.mockRestore()
    }
    expect(await t.db.select().from(user)).toHaveLength(1)
  })

  test("empties the database, runs every migration and creates the reference data", async () => {
    expect(await resetLocalDatabase({ target: "local", url: t.url, host: "test" }, { skipConfirmation: true })).toBe(0)

    expect(await t.db.select().from(user)).toEqual([])
    const { rows } = await t.db.execute<{ applied: number }>(
      sql`select count(*)::int as applied from drizzle.__drizzle_migrations`
    )
    expect(rows).toEqual([{ applied: readMigrations().length }])
    const result = await t.db.execute<{ label: string; name: string | null }>(sql`
      SELECT c.name || s.voice::text AS label, g.name FROM section s
      JOIN "group" g ON g.id = s.group_id JOIN "group" c ON c.id = g.choir_id
      WHERE c.name = 'KK' AND s.voice = 'B'
    `)
    expect(result.rows).toEqual([{ label: "KKB", name: null }])
  }, 60_000)
})
