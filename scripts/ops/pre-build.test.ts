import { afterAll, describe, expect, spyOn, test } from "bun:test"
import { sql } from "drizzle-orm"
import { createTestDatabase } from "../../test/database"
import { readJournal } from "./migration-status"
import { checkProductionMigrations } from "./pre-build"

const database = await createTestDatabase()

/** Runs the check with its console output captured, so the messages can be asserted. */
async function check(environment: Parameters<typeof checkProductionMigrations>[0]) {
  const log = spyOn(console, "log").mockImplementation(() => {})
  const error = spyOn(console, "error").mockImplementation(() => {})
  try {
    const code = await checkProductionMigrations(environment)
    return { code, output: [...log.mock.calls, ...error.mock.calls].flat().join("\n") }
  } finally {
    log.mockRestore()
    error.mockRestore()
  }
}

describe("checkProductionMigrations without a database", () => {
  test("skips preview and local builds", async () => {
    expect((await check({ VERCEL_ENV: "preview", POSTGRES_URL: "postgresql://unused" })).code).toBe(0)
    expect((await check({ POSTGRES_URL: "postgresql://unused" })).code).toBe(0)
  })

  test("stops a production build that has no database to check", async () => {
    expect((await check({ VERCEL_ENV: "production" })).code).toBe(1)
  })

  test("stops a production build whose database cannot be reached", async () => {
    const { code, output } = await check({
      VERCEL_ENV: "production",
      POSTGRES_URL: "postgresql://nobody@127.0.0.1:1/missing"
    })
    expect(code).toBe(1)
    expect(output).toContain("Could not read the migration ledger")
  })
})

describe.skipIf(!database)("checkProductionMigrations", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  test("stops while a migration is pending and passes once it is applied", async () => {
    const latest = readJournal().at(-1) as NonNullable<ReturnType<typeof readJournal>[number]>
    const environment = { VERCEL_ENV: "production", POSTGRES_URL: t.url }

    expect((await check(environment)).code).toBe(0)

    const { rows } = await t.db.execute<{ hash: string }>(
      sql`delete from drizzle.__drizzle_migrations where created_at = ${latest.when} returning hash`
    )

    const behind = await check(environment)
    expect(behind.code).toBe(1)
    expect(behind.output).toContain(`pending: ${latest.tag}`)

    await t.db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${rows[0]?.hash}, ${latest.when})`
    )

    expect((await check(environment)).code).toBe(0)
  })
})
