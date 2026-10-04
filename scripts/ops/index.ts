#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { parseArgs } from "node:util"
import { intro, isCancel, log, outro, select, spinner, text } from "@clack/prompts"
import { openStudio, runMigrations } from "./drizzle-kit"
import { grantAdmin } from "./grant-admin"
import { statusFor, type TargetStatus } from "./migration-status"
import { createReferenceData } from "./reference-data"
import { resetLocalDatabase } from "./reset"
import { childEnvironment, databaseOrExit, type Target, variableFor } from "./target"

/**
 * The single entrypoint for database operations.
 *
 *   bun run ops [command] [--prod] [--yes]
 *   bun run ops grant-admin <email> [--prod] [--yes]
 *   bun run ops reference-data [--prod] [--yes]
 *   bun run ops reset [--yes]
 *
 * With no command it shows the status and, in a terminal, opens a menu. `--prod` is the
 * only way to reach production; without it every command runs against the local database.
 */

const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

const COMMANDS = [
  "status",
  "migrate",
  "studio",
  "grant-admin",
  "reference-data",
  "reset",
  "seed-admin",
  "seed-users",
  "seed-groups"
] as const
type Command = (typeof COMMANDS)[number]

// Bun arguments per seed.
const SEED_SCRIPTS: Record<string, string[]> = {
  "seed-admin": ["run", "scripts/seed-admin.ts"],
  "seed-users": ["run", "scripts/seed-users.ts"],
  "seed-groups": ["run", "scripts/seed-groups.ts"]
}

const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    prod: { type: "boolean", default: false },
    yes: { type: "boolean", short: "y", default: false }
  },
  allowPositionals: true
})

const target: Target = flags.prod ? "prod" : "local"
const command = positionals[0]

if (command !== undefined && !isCommand(command)) {
  console.error(`✖ Unknown command "${command}". Expected one of: ${COMMANDS.join(", ")}.`)
  process.exit(1)
}

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value)
}

/** Runs one command and returns its exit code, so the menu can stay open afterwards. */
async function run(choice: Command): Promise<number> {
  if (choice === "status") {
    await showStatus()
    return 0
  }

  if (choice === "reset") {
    if (target !== "local") {
      log.error("Reset is local-only and never runs against production. Run without --prod.")
      return 1
    }
    return resetLocalDatabase(databaseOrExit("local"), { skipConfirmation: flags.yes })
  }

  if (choice in SEED_SCRIPTS) {
    if (target !== "local") {
      log.error("Seeding is local-only and never runs against production. Run without --prod.")
      return 1
    }
    const database = databaseOrExit("local")
    const seed = spawnSync("bun", SEED_SCRIPTS[choice], { stdio: "inherit", env: childEnvironment(database) })
    return seed.status ?? 1
  }

  const database = databaseOrExit(target)

  if (choice === "grant-admin") {
    const email = positionals[1] ?? (await askForEmail())
    if (!email) {
      log.error("grant-admin needs the email of an existing user: bun run ops grant-admin <email>")
      return 1
    }
    return grantAdmin(database, email, { skipConfirmation: flags.yes })
  }

  if (choice === "reference-data") return createReferenceData(database, { skipConfirmation: flags.yes })

  if (choice === "migrate") {
    const code = await runMigrations(database, { skipConfirmation: flags.yes })
    if (code !== 0) log.error(`Migrations exited with code ${code}.`)
    else await showStatus()
    return code
  }

  log.info("Starting Drizzle Studio — press Ctrl+C to return.")
  return openStudio(database)
}

/** Prompt for the email in a terminal; without one there is nobody to ask. */
async function askForEmail(): Promise<string | undefined> {
  if (!process.stdin.isTTY) return undefined

  const email = await text({
    message: "Email of the existing user to make admin:",
    validate: (value) => (value?.includes("@") ? undefined : "Enter an email address.")
  })

  return isCancel(email) ? undefined : email
}

async function menu(): Promise<void> {
  while (true) {
    const choice = await select<Command | "exit">({
      message: "What would you like to do?",
      options: [
        { value: "status", label: "Status", hint: "migration ledger for local and prod" },
        { value: "migrate", label: "Run migrations", hint: `against ${target}` },
        { value: "studio", label: "Open Studio", hint: `against ${target}` },
        { value: "grant-admin", label: "Grant admin", hint: `existing user, against ${target}` },
        {
          value: "reference-data",
          label: "Create reference data",
          hint: `Choirs, Sections, Styret, Positions, against ${target}`
        },
        localOnlyOption("reset", "Reset local database"),
        localOnlyOption("seed-admin", "Seed admin"),
        localOnlyOption("seed-users", "Seed users"),
        localOnlyOption("seed-groups", "Seed groups"),
        { value: "exit", label: "Exit" }
      ]
    })

    if (isCancel(choice) || choice === "exit") return

    await run(choice)
  }
}

/** Shown always, so the guardrail is visible rather than hidden when it applies. */
function localOnlyOption(value: Command, label: string) {
  return target === "local"
    ? { value, label, hint: "local only" }
    : { value, label: `${DIM}${label}${RESET}`, hint: "local only — disabled" }
}

/**
 * Local and prod side by side: one screen answers "is my local behind, is prod behind, do
 * they agree?", which is the question worth opening this tool for.
 */
async function showStatus(): Promise<void> {
  const progress = spinner()
  progress.start("Reading migration ledgers")

  const [local, prod] = await Promise.all([statusFor("local"), statusFor("prod")])

  progress.stop("Migration status")

  log.message(`${describe("local", local)}\n${describe("prod", prod)}`)
}

function describe(target: Target, status: TargetStatus): string {
  const name = target.padEnd(6)

  if (status.kind === "not-configured") {
    return `${name} ${DIM}not configured${RESET} ${DIM}(set ${variableFor(target)} to enable)${RESET}`
  }

  if (status.kind === "unreachable") {
    return `${name} ${RED}unreachable${RESET} ${DIM}${status.host}${RESET}\n       ${DIM}${status.reason}${RESET}`
  }

  const total = status.applied.length + status.pending.length

  if (status.pending.length === 0) {
    return `${name} ${GREEN}up to date${RESET} ${DIM}${status.host} — ${total} migration(s)${RESET}`
  }

  const behind = `${YELLOW}${status.pending.length} behind${RESET}`
  const pending = status.pending.map((tag) => `\n       ${DIM}pending: ${tag}${RESET}`).join("")

  return `${name} ${behind} ${DIM}${status.host} — ${status.applied.length}/${total} applied${RESET}${pending}`
}

intro(`csk-hub ops  ${DIM}(target: ${target})${RESET}`)

if (command !== undefined) {
  const code = await run(command)
  outro("")
  process.exit(code)
}

await showStatus()

// Without a terminal there is nobody to answer a prompt, so print the status and stop
// rather than blocking forever on a menu that cannot be drawn.
if (!process.stdin.isTTY) {
  outro("")
  process.exit(0)
}

await menu()
outro("Done.")
