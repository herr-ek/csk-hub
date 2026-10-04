import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import type { db as applicationDb } from "@/core/db"
import { isLocalDatabase } from "@/core/db/tls"

export type TestDatabase = {
  /** Typed as the application client, so modules that take one accept it. */
  db: typeof applicationDb
  /** The connection string, for code that connects on its own, such as the ops commands. */
  url: string
  /** Closes the connections and drops the database. */
  drop: () => Promise<void>
}

/**
 * A throwaway database, migrated from scratch, beside the local one in POSTGRES_URL. Tests that
 * need real constraints use it so they never touch development data.
 *
 * Returns undefined when no local database is reachable; callers skip rather than fail, so the
 * suite still runs on a machine without Postgres. It never creates a database anywhere but locally.
 */
export async function createTestDatabase(migrationsFolder = "drizzle"): Promise<TestDatabase | undefined> {
  const baseUrl = process.env.POSTGRES_URL
  if (!baseUrl || !isLocalDatabase(baseUrl)) return undefined

  const name = `csk_hub_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
  const admin = new Client({ connectionString: baseUrl, connectionTimeoutMillis: 2_000 })
  try {
    await admin.connect()
    await admin.query(`CREATE DATABASE "${name}"`)
  } catch (error) {
    console.warn(`Skipping database tests: no local database is reachable (${(error as Error).message}).`)
    await admin.end().catch(() => undefined)
    return undefined
  }
  await admin.end()

  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  const db = drizzle<Record<string, never>>({ connection: url.toString() })
  await migrate(db, { migrationsFolder })

  return {
    db,
    url: url.toString(),
    drop: async () => {
      await db.$client.end()
      const cleanup = new Client({ connectionString: baseUrl })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      await cleanup.end()
    }
  }
}
