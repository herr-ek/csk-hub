import {
  type DatabaseTarget,
  type ResolvedDatabase,
  readDatabaseTarget,
  resolveDatabaseUrl
} from "../../src/core/config/database-url"

// Relative imports, not the `@/` alias: drizzle-kit bundles `drizzle.config.ts` without
// reading tsconfig paths, and this module is on that import path.

const YELLOW = "\x1b[33m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

/**
 * Warn, on stderr, that a command is about to touch production.
 *
 * The failure this defends against is muscle memory rather than malice, so the banner
 * names the host it resolved instead of merely saying "production" — the point is that a
 * developer recognises a machine they did not mean to talk to.
 *
 * Silent for `local`, and for `vercel` because a deployed instance has no one to warn.
 */
export function announceTarget(database: ResolvedDatabase): void {
  if (database.target !== "prod") return

  console.error(`${YELLOW}${BOLD}⚠  PRODUCTION DATABASE${RESET}${YELLOW} — ${database.host}${RESET}`)
}

/**
 * Misconfiguration is a message to read, not a stack trace to decipher. Every tooling
 * entry point resolves through here, so a missing variable or a `DB_TARGET` typo reads the
 * same wherever it surfaces.
 */
export function resolveOrExit(): ResolvedDatabase {
  return orExit(resolveDatabaseUrl)
}

export function targetOrExit(): DatabaseTarget {
  return orExit(readDatabaseTarget)
}

function orExit<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
