import { spawnSync } from "node:child_process"
import { confirmProductionWrite } from "./guards"
import { announce, childEnvironment, type Database } from "./target"

/**
 * Run pending migrations against `database`, confirming first when it is production.
 * Returns the exit code rather than exiting, so the interactive menu can stay open.
 */
export async function runMigrations(database: Database, { skipConfirmation }: { skipConfirmation: boolean }) {
  announce(database)

  if (!(await confirmProductionWrite("Run migrations", database, { skip: skipConfirmation }))) return 1

  const result = spawnSync("bunx", ["drizzle-kit", "migrate"], { stdio: "inherit", env: childEnvironment(database) })

  return result.status ?? 1
}

/** Open Drizzle Studio against `database`. Studio can write, so production is announced. */
export function openStudio(database: Database): number {
  announce(database)

  const result = spawnSync("bunx", ["drizzle-kit", "studio"], { stdio: "inherit", env: childEnvironment(database) })

  return result.status ?? 1
}
