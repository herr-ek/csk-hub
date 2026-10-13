#!/usr/bin/env bun
import { statusOf } from "./migration-status"
import { deploymentDatabase } from "./target"

/**
 * Stops a production Vercel build whose code is ahead of the production database's
 * migrations, so a deploy can never reach users before the schema it needs.
 *
 *   bun run scripts/ops/pre-build.ts
 *
 * It is the `prebuild` hook in `package.json`, so `bun run build` runs it before
 * `next build` and stops if it fails. It holds no state: once the migrations are applied,
 * redeploying the same commit passes. Preview and local builds are not checked.
 *
 * It fails closed. A production build that cannot read the ledger stops too, because "we
 * could not tell" is not evidence that the database is ready.
 */
export async function checkProductionMigrations(
  environment: Record<string, string | undefined> = process.env,
  { timeout }: { timeout?: number } = {}
): Promise<number> {
  if (environment.VERCEL_ENV !== "production") {
    console.log(
      `Skipping the migration check: not a production build (VERCEL_ENV=${environment.VERCEL_ENV ?? "unset"}).`
    )
    return 0
  }

  const database = deploymentDatabase(environment)
  if (!database) {
    console.error("✖ POSTGRES_URL is not set for this production build, so its migrations cannot be checked.")
    return 1
  }

  const status = await statusOf(database, { timeout })

  if (status.kind === "unreachable") {
    console.error(`✖ Could not read the migration ledger of ${status.host}: ${status.reason}`)
    console.error("  The build stops rather than deploy against a database it could not check.")
    return 1
  }

  if (status.pending.length > 0) {
    console.error(
      `✖ The production database (${status.host}) is ${status.pending.length} migration(s) behind this commit:`
    )
    for (const tag of status.pending) console.error(`    pending: ${tag}`)
    console.error("  Apply them with `bun run ops migrate --prod`, then redeploy this commit.")
    return 1
  }

  console.log(`✔ The production database (${status.host}) has all ${status.applied.length} migration(s).`)
  return 0
}

if (import.meta.main) process.exit(await checkProductionMigrations())
