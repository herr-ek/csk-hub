import { isLocalDatabase } from "@/core/db/tls"

/** Fail closed before opening any connection; credentials are never included in errors. */
export function databaseTestConnection(env: Record<string, string | undefined> = process.env): {
  url: string
  prefix: string
} {
  const url = env.TEST_POSTGRES_URL
  const prefix = env.TEST_DATABASE_PREFIX
  if (!url) throw new Error("TEST_POSTGRES_URL is required. Run database tests with bun run tst:db.")
  try {
    const parsed = new URL(url)
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !isLocalDatabase(url)) throw new Error()
    if ([...parsed.searchParams.keys()].some((key) => key !== "application_name")) throw new Error()
  } catch {
    throw new Error("TEST_POSTGRES_URL must be a local PostgreSQL URL without connection overrides.")
  }
  if (!prefix || !/^csk_hub_test_[a-f0-9]{12}_$/.test(prefix)) {
    throw new Error("Database tests require a run-specific prefix. Use bun run tst:db.")
  }
  return { url, prefix }
}
