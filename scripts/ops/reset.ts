import { confirm, isCancel } from "@clack/prompts"
import { Client } from "pg"
import { isLocalDatabase, secureConnection } from "@/core/db/tls"
import { runMigrations } from "./drizzle-kit"
import { createReferenceData } from "./reference-data"
import type { Database } from "./target"

/**
 * Empty the local database and build it again: drop every table, type, function and the
 * migration ledger, run all migrations, then create the reference data. Seeds are left to the
 * seed commands, so a reset never fabricates users on its own.
 *
 * Local-only by refusal, like seeding: there is no circumstance in which "erase production?"
 * should be answerable with yes. Returns the exit code rather than exiting, so the interactive
 * menu can stay open.
 */
export async function resetLocalDatabase(
  database: Database,
  { skipConfirmation }: { skipConfirmation: boolean }
): Promise<number> {
  if (database.target !== "local" || !isLocalDatabase(database.url)) {
    console.error("✖ Reset is local-only and needs POSTGRES_URL to point at a local database.")
    return 1
  }

  if (!(await confirmReset(database, { skip: skipConfirmation }))) return 1

  const client = new Client(secureConnection(database.url))
  try {
    await client.connect()
    // Dropping the schemas rather than the database needs no CREATEDB privilege, and takes the
    // migration ledger (schema "drizzle") with it so every migration runs again.
    await client.query(`DROP SCHEMA IF EXISTS "drizzle" CASCADE`)
    await client.query(`DROP SCHEMA IF EXISTS "public" CASCADE`)
    await client.query(`CREATE SCHEMA "public"`)
  } finally {
    await client.end().catch(() => {})
  }
  console.log(`Emptied ${database.host}.`)

  const migrated = await runMigrations(database, { skipConfirmation: true })
  if (migrated !== 0) {
    console.error(`✖ Migrations exited with code ${migrated}; the database is empty or partly migrated.`)
    return migrated
  }

  const code = await createReferenceData(database, { skipConfirmation: true })
  if (code === 0) console.log("Seed it with: bun run ops seed-admin, seed-users, seed-groups")
  return code
}

/** Ask before erasing, since local data may be worth keeping. Without a terminal, refuse. */
async function confirmReset(database: Database, { skip }: { skip: boolean }): Promise<boolean> {
  if (skip) return true

  if (!process.stdin.isTTY) {
    console.error(`✖ Resetting ${database.host} needs confirmation, but there is no terminal to ask.`)
    console.error("  Pass --yes to proceed unattended.")
    return false
  }

  const answer = await confirm({
    message: `Erase everything in ${database.host} and migrate it from scratch?`,
    initialValue: false
  })
  if (isCancel(answer) || !answer) {
    console.error("Aborted.")
    return false
  }
  return true
}
