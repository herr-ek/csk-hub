import { readFileSync } from "node:fs"
import { Client } from "pg"
import { type DatabaseTarget, databaseUrlFor, describeHost } from "@/core/config/database-url"

/**
 * Compares the migration files on disk against the ledger a database has actually
 * applied. This is a *ledger* comparison, not a schema diff: it answers "is this database
 * behind the code?" and deliberately does not detect a column altered by hand in the
 * Supabase dashboard.
 */

type JournalEntry = {
  idx: number
  /** Millisecond timestamp, and the value drizzle records as `created_at`. */
  when: number
  tag: string
}

export type TargetStatus =
  | { kind: "not-configured" }
  | { kind: "unreachable"; host: string; reason: string }
  | { kind: "ok"; host: string; applied: string[]; pending: string[] }

const JOURNAL = new URL("../../drizzle/meta/_journal.json", import.meta.url)

export function readJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as { entries: JournalEntry[] }
  return [...journal.entries].sort((a, b) => a.idx - b.idx)
}

/**
 * Certificate verification stays on. A managed database whose CA is not in the platform
 * trust store can supply one through `DB_SSL_CA`; the deliberate absence of an "ignore
 * certificates" switch is the point, since the status this tool reports is only worth
 * anything if the server is who it claims to be.
 */
function sslOptionsFor(url: string) {
  const { hostname } = new URL(url)
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined

  const caPath = process.env.DB_SSL_CA
  return caPath ? { ca: readFileSync(caPath, "utf8") } : true
}

export async function statusFor(target: DatabaseTarget): Promise<TargetStatus> {
  const url = databaseUrlFor(target)
  if (!url) return { kind: "not-configured" }

  const host = describeHost(url)
  const entries = readJournal()
  const client = new Client({ connectionString: url, ssl: sslOptionsFor(url) })

  try {
    await client.connect()

    const { rows } = await client.query<{ created_at: string }>(
      `select created_at from drizzle.__drizzle_migrations order by created_at`
    )
    const appliedAt = new Set(rows.map((row) => Number(row.created_at)))

    return {
      kind: "ok",
      host,
      applied: entries.filter((entry) => appliedAt.has(entry.when)).map((entry) => entry.tag),
      pending: entries.filter((entry) => !appliedAt.has(entry.when)).map((entry) => entry.tag)
    }
  } catch (error) {
    // An absent ledger means the database exists but has never been migrated, which is a
    // normal state for a fresh checkout rather than a failure to report.
    if (isMissingLedger(error)) {
      return { kind: "ok", host, applied: [], pending: entries.map((entry) => entry.tag) }
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
