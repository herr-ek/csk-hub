import { spawnSync } from "node:child_process"
import { confirmProductionWrite } from "./guards"
import { resolveOrExit } from "./target"

/**
 * Run pending migrations against the resolved target, confirming first when that target is
 * production. Shared by `bun run db:migrate` and the ops CLI so both doors carry the same
 * guardrail. Returns the exit code rather than exiting, so the CLI can stay open.
 */
export async function runMigrations({ skipConfirmation }: { skipConfirmation: boolean }): Promise<number> {
  // Resolve before spawning so a missing variable is reported here, not as a drizzle-kit
  // failure several lines into its own output.
  const { target } = resolveOrExit()

  if (target === "prod") {
    await confirmProductionWrite("Run migrations", { skip: skipConfirmation })
  }

  // drizzle-kit re-reads drizzle.config.ts, which prints the production banner.
  const result = spawnSync("bunx", ["drizzle-kit", "migrate"], { stdio: "inherit" })

  return result.status ?? 1
}
