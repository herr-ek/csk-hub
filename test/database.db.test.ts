import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { Client } from "pg"
import { cleanupTestDatabases, createTestDatabase, withAdmin } from "./database"
import { databaseTestConnection } from "./database-config"
import { withTestDatabase } from "./database-test"

async function ownedDatabases() {
  const { url, prefix } = databaseTestConnection()
  return withAdmin(url, async (admin) => {
    const { rows } = await admin.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE left(datname, length($1)) = $1 ORDER BY datname",
      [prefix]
    )
    return rows.map(({ datname }) => datname)
  })
}

describe("database test lifecycle", () => {
  test("fresh databases contain migrations but no data from another test", async () => {
    await withTestDatabase(async ({ db }) => {
      await db.execute(sql`CREATE TABLE fixture_marker (value text)`)
      await db.execute(sql`INSERT INTO fixture_marker VALUES ('first test')`)
    })
    await withTestDatabase(async ({ db }) => {
      const { rows } = await db.execute(sql`SELECT to_regclass('public.fixture_marker') AS marker`)
      expect(rows).toEqual([{ marker: null }])
      const migrations = await db.execute(sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`)
      expect(migrations.rows[0].count).toBeGreaterThan(0)
    })
    expect(await ownedDatabases()).toEqual([])
  }, 60_000)

  test("cleans up when migration loading fails", async () => {
    await expect(createTestDatabase("/nonexistent-csk-test-migrations")).rejects.toThrow()
    expect(await ownedDatabases()).toEqual([])
  }, 60_000)

  test("cleans up when feature fixture creation fails", async () => {
    const failure = new Error("fixture failed")
    await expect(
      withTestDatabase(
        async () => {
          throw new Error("test body must not run")
        },
        async ({ db }) => {
          await db.execute(sql`CREATE TABLE fixture_marker (value text)`)
          throw failure
        }
      )
    ).rejects.toBe(failure)
    expect(await ownedDatabases()).toEqual([])
  }, 60_000)

  test("cleans up when the test body never completes", async () => {
    await expect(withTestDatabase(() => new Promise(() => {}), undefined, 50)).rejects.toThrow("exceeded 50 ms")
    expect(await ownedDatabases()).toEqual([])
  }, 60_000)

  test("preserves test failures and closes extra connections during cleanup", async () => {
    const failure = new Error("assertion failed")
    let extra: Client | undefined
    try {
      await expect(
        withTestDatabase(async ({ url }) => {
          extra = new Client({ connectionString: url })
          extra.on("error", () => {}) // DROP WITH FORCE terminates an abandoned external connection.
          await extra.connect()
          throw failure
        })
      ).rejects.toBe(failure)
      if (!extra) throw new Error("External connection was not created")
      await expect(extra.query("SELECT 1")).rejects.toThrow()
    } finally {
      await extra?.end()
    }
    expect(await ownedDatabases()).toEqual([])
  }, 60_000)

  test("reports both the assertion failure and cleanup failure", async () => {
    const assertion = new Error("assertion failed")
    const cleanup = new Error("cleanup failed")
    let caught: unknown
    try {
      await withTestDatabase(
        async () => {
          throw assertion
        },
        (database) => {
          const drop = database.drop
          database.drop = async () => {
            await drop()
            throw cleanup
          }
          return database
        }
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([assertion, cleanup])
    expect(await ownedDatabases()).toEqual([])
  }, 60_000)

  test("drop is idempotent and runner cleanup recovers an abandoned database", async () => {
    const database = await createTestDatabase()
    try {
      await cleanupTestDatabases()
      expect(await ownedDatabases()).toEqual([])
    } finally {
      await database.drop()
      await database.drop()
    }
  }, 60_000)
})
