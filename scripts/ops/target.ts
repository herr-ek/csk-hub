/**
 * The one place a database target is chosen. Local is the default and production is a
 * deliberate opt-in (`--prod`), so forgetting a flag is safe rather than dangerous.
 *
 * Nothing outside `scripts/ops` reads POSTGRES_URL_PROD. Child processes — drizzle-kit and
 * the seed scripts — are handed the selected URL as their ordinary POSTGRES_URL.
 */

export type Target = "local" | "prod"

export type Database = {
  target: Target
  url: string
  /** Host, port and database name, with any credentials removed. Safe to print. */
  host: string
}

const VARIABLE: Record<Target, string> = {
  local: "POSTGRES_URL",
  prod: "POSTGRES_URL_PROD"
}

const YELLOW = "\x1b[33m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

/** The environment variable a target reads from, for use in error and help messages. */
export function variableFor(target: Target): string {
  return VARIABLE[target]
}

/** The configured database for a target, or `undefined` when it is not set up. */
export function databaseFor(target: Target): Database | undefined {
  const url = process.env[VARIABLE[target]]
  if (!url) return undefined

  return { target, url, host: describeHost(url) }
}

/**
 * The configured database for a target. Misconfiguration is a message to read, not a
 * stack trace to decipher.
 */
export function databaseOrExit(target: Target): Database {
  const database = databaseFor(target)
  if (database) return database

  console.error(`✖ ${VARIABLE[target]} is not set.`)
  console.error(
    target === "prod"
      ? "  Set it to the direct (non-pooling) Supabase connection string — port 5432, not the\n  transaction pooler on 6543, which cannot run migrations."
      : '  Copy it from .env.example — with `docker compose up -d` the value is:\n  POSTGRES_URL="postgresql://csk_hub:csk_hub@localhost:5433/csk_hub"'
  )
  process.exit(1)
}

/**
 * Warn, on stderr, that a command is about to touch production.
 *
 * The failure this defends against is muscle memory rather than malice, so the banner
 * names the host instead of merely saying "production" — the point is that a developer
 * recognises a machine they did not mean to talk to.
 */
export function announce(database: Database): void {
  if (database.target !== "prod") return

  console.error(`${YELLOW}${BOLD}⚠  PRODUCTION DATABASE${RESET}${YELLOW} — ${database.host}${RESET}`)
}

/** The environment for a child process that should connect to `database`. */
export function childEnvironment(database: Database): NodeJS.ProcessEnv {
  return { ...process.env, POSTGRES_URL: database.url }
}

function describeHost(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`
  } catch {
    return "<unparseable connection string>"
  }
}
