/**
 * Facts about a connection string, shared by the ops CLI and the test harness. Connecting
 * itself needs nothing from here: every client hands the URL to `pg` unchanged, so TLS follows
 * the URL's own `sslmode` (none on the stack's private network).
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Whether a connection string points at a database on this machine. The local-only guards
 * (seeding, reset, throwaway test databases) use it, so a stack's `db` host never counts.
 */
export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname)
}
