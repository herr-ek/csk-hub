import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * One TLS policy for every path that opens a database connection from a developer's
 * machine — the ops status check and drizzle-kit alike. Keeping it in one module is what
 * stops the two from verifying on different terms.
 *
 * Supabase signs its certificates with its own root rather than a public CA, so no system
 * trust store contains it. The certificate is public, identical for every project and
 * valid until 2031, so it is committed rather than made a setup step each contributor has
 * to repeat.
 */

// Resolved against the working directory rather than `import.meta.url`: drizzle-kit
// bundles `drizzle.config.ts` to a temporary file, which would move `import.meta.url`
// away from the repository. Every command that reaches here runs from the package root.
const SUPABASE_CA = join(process.cwd(), "src/core/config/prod-ca-2021.crt")

export type Connection = {
  /** The connection string to dial, with any `sslmode` removed. */
  url: string
  /** Verification options, or `undefined` for a local database. */
  ssl?: { ca: string }
}

/**
 * Pair a connection string with the TLS options to dial it.
 *
 * `sslmode` is stripped from the string deliberately. `pg` treats a `sslmode` in the
 * connection string as authoritative and ignores explicit `ssl` options entirely, so a
 * Supabase URL copied from the dashboard — they carry `?sslmode=require` — would silently
 * discard the CA below and verify against the system trust store instead, which fails.
 * Removing it lets this one policy govern every connection.
 *
 * Verification stays on for anything that is not a local database, with `DB_SSL_CA`
 * overriding the bundled root for another managed provider. There is deliberately no
 * switch to skip verification: a tool that reports on production is only worth anything if
 * the server is who it claims to be.
 */
export function connectionFor(url: string): Connection {
  const parsed = new URL(url)
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"

  if (!parsed.searchParams.has("sslmode")) {
    return isLocal ? { url } : { url, ssl: { ca: readCertificate() } }
  }

  parsed.searchParams.delete("sslmode")
  const stripped = parsed.toString()

  return isLocal ? { url: stripped } : { url: stripped, ssl: { ca: readCertificate() } }
}

function readCertificate(): string {
  return readFileSync(process.env.DB_SSL_CA ?? SUPABASE_CA, "utf8")
}
