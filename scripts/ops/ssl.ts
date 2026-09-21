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

/**
 * Certificate verification stays on for anything that is not a local database, with
 * `DB_SSL_CA` overriding the bundled root for another managed provider. There is
 * deliberately no switch to skip verification: a tool that reports on production is only
 * worth anything if the server is who it claims to be.
 */
export function sslOptionsFor(url: string): { ca: string } | undefined {
  const { hostname } = new URL(url)
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined

  return { ca: readFileSync(process.env.DB_SSL_CA ?? SUPABASE_CA, "utf8") }
}
