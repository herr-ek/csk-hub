import { spawnSync } from "node:child_process"
import { confirmProductionWrite } from "./guards"
import { announce, childEnvironment, type Database } from "./target"

/**
 * Run pending migrations against `database`, confirming first when it is production.
 * Returns the exit code rather than exiting, so the interactive menu can stay open.
 */
export async function runMigrations(
  database: Database,
  { skipConfirmation, captureOutput = false }: { skipConfirmation: boolean; captureOutput?: boolean }
) {
  announce(database)

  if (!(await confirmProductionWrite("Run migrations", database, { skip: skipConfirmation }))) return 1

  // Tests can capture subprocess diagnostics; direct ops commands retain live terminal output.
  const result = spawnSync("bunx", ["drizzle-kit", "migrate"], {
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    timeout: captureOutput ? 30_000 : undefined,
    env: childEnvironment(database)
  })
  if (result.stdout) console.log(result.stdout.trimEnd())
  if (result.stderr) console.error(result.stderr.trimEnd())
  if (result.error) console.error(result.error.message)

  return result.status ?? 1
}

/** Open Drizzle Studio against `database`. Studio can write, so production is announced. */
export function openStudio(database: Database): number {
  announce(database)

  const result = spawnSync("bunx", ["drizzle-kit", "studio"], { stdio: "inherit", env: childEnvironment(database) })

  return result.status ?? 1
}
