import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * How a connection string is dialled securely. Shared by the application client,
 * `drizzle.config.ts` and the ops CLI so that none of them can verify on weaker terms than
 * the others. It says nothing about *which* database to connect to — callers bring the URL.
 *
 * No relative-path or `@/` imports: drizzle-kit bundles `drizzle.config.ts` without reading
 * tsconfig paths, and this module is on that import path.
 */

// Resolved against the working directory rather than `import.meta.url`: drizzle-kit
// bundles its config to a temporary file, which would move `import.meta.url` away from the
// repository. Next.js and every script run from the package root, and `next.config.ts`
// includes this file in the server trace so deployed functions can read it.
const SUPABASE_ROOT_CA = join(process.cwd(), "src/core/db/certs/supabase-root-2021.crt")

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

export type Connection = {
  /** The connection string to dial, with any `sslmode` removed. */
  connectionString: string
  /** Verification options, or `undefined` for a local database. */
  ssl?: { ca: string; rejectUnauthorized: true }
}

/** Whether a connection string points at a database on this machine. */
export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname)
}

/**
 * Pair a connection string with the TLS options to dial it.
 *
 * Anything that is not a local database is verified against the Supabase root CA, and
 * there is deliberately no switch to skip verification.
 *
 * `sslmode` is stripped deliberately. `pg` treats a `sslmode` in the connection string as
 * authoritative and ignores explicit `ssl` options, so a Supabase URL — they carry
 * `?sslmode=require` — would silently discard the CA and verify against the system trust
 * store instead, which fails. Removing it lets this one policy govern every connection.
 */
export function secureConnection(url: string): Connection {
  const parsed = new URL(url)
  parsed.searchParams.delete("sslmode")
  const connectionString = parsed.toString()

  if (isLocalDatabase(url)) return { connectionString }

  return { connectionString, ssl: { ca: readFileSync(SUPABASE_ROOT_CA, "utf8"), rejectUnauthorized: true } }
}
