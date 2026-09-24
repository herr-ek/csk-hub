import { isCancel, text } from "@clack/prompts"
import { isLocalDatabase } from "@/core/db/tls"
import type { Database } from "./target"

/**
 * Refuse to run a local-only action against anything but a local database.
 *
 * A refusal rather than a prompt: seeding fabricates users, and there is no circumstance
 * in which the right answer to "seed production?" is yes. The seed scripts call this on
 * their own POSTGRES_URL too, so running one by hand is held to the same rule.
 */
export function assertLocalDatabase(action: string, url = process.env.POSTGRES_URL): void {
  if (url && isLocalDatabase(url)) return

  console.error(`✖ ${action} is local-only and needs POSTGRES_URL to point at a local database.`)
  process.exit(1)
}

/**
 * Require the word "prod" to be typed before a write reaches production.
 *
 * A speed bump against muscle memory, not an authorisation check — the value is in making
 * the developer read the host name before the write happens. Returns whether to proceed.
 */
export async function confirmProductionWrite(
  action: string,
  database: Database,
  { skip }: { skip: boolean }
): Promise<boolean> {
  if (database.target !== "prod") return true

  if (skip) {
    console.error(`Proceeding with ${action} against ${database.host} (--yes).`)
    return true
  }

  // Refuse rather than block on a prompt nobody can answer. An unattended run reaching
  // production without --yes is a mistake worth failing loudly.
  if (!process.stdin.isTTY) {
    console.error(`✖ ${action} against ${database.host} needs confirmation, but there is no terminal to ask.`)
    console.error("  Pass --yes to proceed unattended.")
    return false
  }

  const typed = await text({
    message: `${action} against PRODUCTION (${database.host}). Type "prod" to continue:`,
    placeholder: "prod",
    validate: (value) => (value === "prod" ? undefined : 'Type "prod" exactly, or press Ctrl+C to abort.')
  })

  if (isCancel(typed)) {
    console.error("Aborted.")
    return false
  }

  return true
}
