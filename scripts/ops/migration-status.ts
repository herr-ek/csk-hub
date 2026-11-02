import { fileURLToPath } from "node:url"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { Client } from "pg"
import { secureConnection } from "@/core/db/tls"
import { type Database, databaseFor, type Target } from "./target"

/**
 * Compares the migration files on disk against the ledger a database has actually
 * applied. This is a *ledger* comparison, not a schema diff: it answers "is this database
 * behind the code?" and deliberately does not detect a column altered by hand in the
 * Supabase dashboard.
 */

export type TargetStatus =
  | { kind: "not-configured" }
  | { kind: "unreachable"; host: string; reason: string }
  | { kind: "ok"; host: string; applied: string[]; pending: string[] }

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url))

/** Read the ordered local migrations using the same parser and SQL hashes as Drizzle. */
export function readMigrations() {
  return readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
}

export async function statusFor(target: Target): Promise<TargetStatus> {
  const database = databaseFor(target)
  if (!database) return { kind: "not-configured" }

  return statusOf(database)
}

/**
 * The ledger status of an already-resolved database; never `not-configured`.
 *
 * Connecting and the ledger query are each bounded by `timeout` milliseconds, so a database
 * that stops answering, or a lock held on the ledger, reports `unreachable` rather than
 * hanging. Ending the client while the timed-out query is still active destroys the socket.
 */
export async function statusOf(
  database: Database,
  { timeout = 10_000 }: { timeout?: number } = {}
): Promise<Exclude<TargetStatus, { kind: "not-configured" }>> {
  const { host } = database
  const entries = readMigrations()
  const client = new Client({
    ...secureConnection(database.url),
    connectionTimeoutMillis: timeout,
    query_timeout: timeout
  })

  try {
    await client.connect()

    const { rows } = await client.query<{ name: string | null; hash: string }>(
      // Reading the row as JSON also works before v1's migrator adds the name column.
      `select to_jsonb(m)->>'name' as name, hash from drizzle.__drizzle_migrations m`
    )
    const appliedNames = new Set(rows.flatMap((row) => (row.name === null ? [] : [row.name])))
    const legacyHashes = new Set(rows.filter((row) => row.name === null).map((row) => row.hash))
    const applied = entries.filter((entry) => appliedNames.has(entry.name) || legacyHashes.has(entry.hash))
    const appliedSet = new Set(applied)

    return {
      kind: "ok",
      host,
      applied: applied.map((entry) => entry.name),
      pending: entries.filter((entry) => !appliedSet.has(entry)).map((entry) => entry.name)
    }
  } catch (error) {
    // An absent ledger means the database exists but has never been migrated, which is a
    // normal state for a fresh checkout rather than a failure to report.
    if (isMissingLedger(error)) {
      return { kind: "ok", host, applied: [], pending: entries.map((entry) => entry.name) }
    }

    return { kind: "unreachable", host, reason: describeError(error) }
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * A refused connection arrives as an AggregateError whose own message is empty, so the
 * useful text has to be dug out of the causes — otherwise the status screen reports a
 * failure with no reason attached.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return [...new Set(error.errors.map(describeError))].join("; ")
  }

  const { message, code } = (error ?? {}) as { message?: string; code?: string }
  return message || code || String(error)
}

/** Postgres 3F000 (undefined schema) and 42P01 (undefined table). */
function isMissingLedger(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  return code === "3F000" || code === "42P01"
}
