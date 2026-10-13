import { describe, expect, spyOn } from "bun:test"
import { databaseTest } from "@test/database-test"
import { sql } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { group } from "@/core/db/schema/org-structure"
import { readJournal } from "./migration-status"
import { resetLocalDatabase } from "./reset"

const test = databaseTest()

describe("resetLocalDatabase", () => {
  test("refuses production and any database that is not local", async (t) => {
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

  test("empties the database, runs every migration and seeds the organisation structure", async (t) => {
    await t.db.insert(user).values({ id: "removed", name: "Removed", email: "removed@example.com" })
    expect(
      await resetLocalDatabase(
        { target: "local", url: t.url, host: "test" },
        { skipConfirmation: true, captureOutput: true }
      )
    ).toBe(0)

    expect(await t.db.select().from(user)).toEqual([])
    const { rows } = await t.db.execute(sql`select count(*)::int as applied from drizzle.__drizzle_migrations`)
    expect(rows).toEqual([{ applied: readJournal().length }])
    const names = (await t.db.select({ name: group.name }).from(group)).map(({ name }) => name)
    expect(names).toContain("KKB")
    expect(names).toContain("KK roddgrupp")
  }, 60_000)
})
