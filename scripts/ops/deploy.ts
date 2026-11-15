#!/usr/bin/env bun
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { MIGRATIONS_FOLDER } from "./migration-status"
import { createReferenceData } from "./reference-data"
import { type Database, databaseOrExit } from "./target"

/**
 * What the stack's `migrate` service runs on every deploy, before the app starts: apply the
 * pending migrations, then create any missing reference data. Both are no-ops when there is
 * nothing to do. A non-zero exit, or a thrown migration error, keeps the new app from starting.
 *
 *   bun run scripts/ops/deploy.ts
 *
 * It uses drizzle-orm's migrator, as the test databases do, rather than drizzle-kit, so the
 * migrate image needs no development dependencies.
 */
export async function deploy(database: Database): Promise<number> {
  const db = drizzle({ connection: database.url })
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await db.$client.end()
  }
  console.log(`✔ Migrations are up to date on ${database.host}.`)

  return createReferenceData(database, { skipConfirmation: true })
}

if (import.meta.main) process.exit(await deploy(databaseOrExit("local")))
