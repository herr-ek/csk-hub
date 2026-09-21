import { isCancel, text } from "@clack/prompts"
import { readDatabaseTarget } from "@/core/config/database-url"
import { resolveOrExit } from "./target"

/**
 * Refuse to run a local-only action against production.
 *
 * A refusal rather than a prompt: seeding fabricates users, and there is no circumstance
 * in which the right answer to "seed production?" is yes.
 */
export function assertLocalTarget(action: string): void {
  if (readDatabaseTarget() === "local") return

  const { host } = resolveOrExit()
  console.error(`✖ ${action} is local-only and will not run against ${host}.`)
  console.error("  Unset DB_TARGET to use the local database.")
  process.exit(1)
}

/**
 * Require the word "prod" to be typed before a write reaches production.
 *
 * A speed bump against muscle memory, not an authorisation check — the value is in making
 * the developer read the host name before the write happens.
 */
export async function confirmProductionWrite(action: string, { skip }: { skip: boolean }): Promise<void> {
  const { host } = resolveOrExit()

  if (skip) {
    console.error(`Proceeding with ${action} against ${host} (--yes).`)
    return
  }

  // Refuse rather than block on a prompt nobody can answer. An unattended run reaching
  // production without --yes is a mistake worth failing loudly.
  if (!process.stdin.isTTY) {
    console.error(`✖ ${action} against ${host} needs confirmation, but there is no terminal to ask.`)
    console.error("  Pass --yes to proceed unattended.")
    process.exit(1)
  }

  const typed = await text({
    message: `${action} against PRODUCTION (${host}). Type "prod" to continue:`,
    placeholder: "prod",
    validate: (value) => (value === "prod" ? undefined : 'Type "prod" exactly, or press Ctrl+C to abort.')
  })

  if (isCancel(typed)) {
    console.error("Aborted.")
    process.exit(1)
  }
}

/** Whether `--yes` was passed, for unattended use in CI. */
export function hasYesFlag(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes("--yes") || argv.includes("-y")
}
