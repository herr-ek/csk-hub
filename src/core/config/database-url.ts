/**
 * The one place a database connection string is chosen.
 *
 * Local is the default and production is a deliberate opt-in, so that forgetting to set
 * anything is safe rather than dangerous. `env.ts`, `drizzle.config.ts` and `scripts/ops`
 * all resolve through here; none of them reads a `POSTGRES_URL*` variable directly.
 *
 * This module deliberately lives outside `env.ts`: that module validates the *whole*
 * application environment and exits the process when anything is missing, which would
 * force drizzle-kit and the ops CLI to supply VAPID keys and an auth secret just to pick a
 * connection string.
 */

/** A target a developer can select from their own machine. */
export type DatabaseTarget = "local" | "prod"

/** `vercel` is not selectable — it is what a deployed instance resolves to. */
export type ResolvedTarget = DatabaseTarget | "vercel"

export type ResolvedDatabase = {
  url: string
  target: ResolvedTarget
  /** Host, port and database name, with any credentials removed. Safe to print. */
  host: string
}

const TARGET_VARIABLE: Record<DatabaseTarget, string> = {
  local: "POSTGRES_URL_LOCAL",
  prod: "POSTGRES_URL_PROD"
}

/**
 * The selected target, defaulting to `local`. An unrecognised value is an error rather
 * than a silent fall back to the default: `DB_TARGET=production` is a typo that must not
 * quietly run against the local database.
 */
export function readDatabaseTarget(): DatabaseTarget {
  const raw = process.env.DB_TARGET

  if (raw === undefined || raw === "") return "local"
  if (raw === "local" || raw === "prod") return raw

  throw new Error(`DB_TARGET must be "local" or "prod" (received "${raw}").`)
}

/** The configured URL for a target, or `undefined` when that target is not set up. */
export function databaseUrlFor(target: DatabaseTarget): string | undefined {
  const value = process.env[TARGET_VARIABLE[target]]
  return value === undefined || value === "" ? undefined : value
}

/** The environment variable a target reads from, for use in error and help messages. */
export function variableFor(target: DatabaseTarget): string {
  return TARGET_VARIABLE[target]
}

/**
 * Host, port and database name of a connection string, with credentials stripped so the
 * result can be printed in banners and status output.
 */
export function describeHost(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`
  } catch {
    return "<unparseable connection string>"
  }
}

/**
 * Resolve the connection string for the current process.
 *
 * On Vercel the platform injects the connection string, so deployed behaviour is
 * unchanged. Everywhere else the choice is `DB_TARGET`, which defaults to `local`.
 */
export function resolveDatabaseUrl(): ResolvedDatabase {
  if (process.env.VERCEL_ENV) {
    const injected = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING

    if (!injected) {
      throw new Error("Running on Vercel but neither POSTGRES_URL nor POSTGRES_URL_NON_POOLING is set.")
    }

    return { url: injected, target: "vercel", host: describeHost(injected) }
  }

  const target = readDatabaseTarget()
  const url = databaseUrlFor(target)

  if (!url) throw new Error(missingTargetMessage(target))

  return { url, target, host: describeHost(url) }
}

function missingTargetMessage(target: DatabaseTarget): string {
  const variable = TARGET_VARIABLE[target]

  if (target === "prod") {
    return [
      `${variable} is not set, so the production database cannot be reached.`,
      "Set it to the direct (non-pooling) Supabase connection string — port 5432, not the",
      "transaction pooler on 6543, which cannot run migrations."
    ].join("\n")
  }

  return [
    `${variable} is not set.`,
    "Copy it from .env.example into your .env — with `docker compose up -d` the value is:",
    '  POSTGRES_URL_LOCAL="postgresql://csk_hub:csk_hub@localhost:5433/csk_hub"'
  ].join("\n")
}
