import { resolve } from "node:path"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client, Pool } from "pg"
import type { db as applicationDb } from "@/core/db"
import { databaseTestConnection } from "./database-config"

export type TestDatabase = {
  db: typeof applicationDb
  url: string
  /** Idempotent; closes the pool and drops only this fixture's database. */
  drop: () => Promise<void>
}

const migrations = resolve(import.meta.dir, "../drizzle")

/** A fresh database per test, including the handwritten migration SQL. Never uses POSTGRES_URL. */
export async function createTestDatabase(migrationsFolder = migrations): Promise<TestDatabase> {
  const { url: baseUrl, prefix } = databaseTestConnection()
  const name = `${prefix}${crypto.randomUUID().replaceAll("-", "")}`
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  const pool = new Pool({
    connectionString: url.toString(),
    max: 8,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    lock_timeout: 10_000
  })
  const db = drizzle<Record<string, never>>(pool)
  let dropped = false
  let closing: Promise<void> | undefined

  async function drop() {
    if (dropped) return
    const errors: unknown[] = []
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      closing ??= pool.end()
      await Promise.race([
        closing,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("Test pool did not close within 5 seconds")), 5_000)
        })
      ])
    } catch (error) {
      errors.push(error)
    } finally {
      clearTimeout(deadline)
    }
    try {
      await withAdmin(baseUrl, (admin) => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`))
      dropped = true
    } catch (error) {
      errors.push(error)
    }
    if (errors.length) throw new AggregateError(errors, "Failed to clean up the test database")
  }

  try {
    await withAdmin(baseUrl, (admin) => admin.query(`CREATE DATABASE "${name}"`))
    await migrate(db, { migrationsFolder })
    return { db, url: url.toString(), drop }
  } catch (error) {
    try {
      await drop()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Test database setup and cleanup failed")
    }
    throw error
  }
}

export async function withAdmin<T>(url: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 })
  try {
    await client.connect()
    return await work(client)
  } finally {
    await client.end()
  }
}

/** Runner fallback after failures, timeouts or signals. Only this run's random prefix is eligible. */
export async function cleanupTestDatabases() {
  const { url, prefix } = databaseTestConnection()
  await withAdmin(url, async (admin) => {
    const { rows } = await admin.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE left(datname, length($1)) = $1",
      [prefix]
    )
    const errors: unknown[] = []
    for (const { datname } of rows) {
      try {
        if (!/^[a-z0-9_]+$/.test(datname)) throw new Error("Unexpected test database name")
        await admin.query(`DROP DATABASE "${datname}" WITH (FORCE)`)
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new AggregateError(errors, "Could not remove all databases owned by this test run")
  })
}
