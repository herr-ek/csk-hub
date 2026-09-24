#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { parseArgs } from "node:util"
import { intro, isCancel, log, outro, select, spinner } from "@clack/prompts"
import { openStudio, runMigrations } from "./drizzle-kit"
import { statusFor, type TargetStatus } from "./migration-status"
import { childEnvironment, databaseOrExit, type Target, variableFor } from "./target"

/**
 * The single entrypoint for database operations.
 *
 *   bun run ops [command] [--prod] [--yes]
 *
 * With no command it shows the status and, in a terminal, opens a menu. `--prod` is the
 * only way to reach production; without it every command runs against the local database.
 */

const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

const COMMANDS = ["status", "migrate", "studio", "seed-admin", "seed-users"] as const
type Command = (typeof COMMANDS)[number]

const SEED_SCRIPTS: Record<string, string> = {
  "seed-admin": "scripts/seed-admin.ts",
  "seed-users": "scripts/seed-users.ts"
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

  if (choice in SEED_SCRIPTS) {
    if (target !== "local") {
      log.error("Seeding is local-only and never runs against production. Run without --prod.")
      return 1
    }
    const database = databaseOrExit("local")
    const seed = spawnSync("bun", ["run", SEED_SCRIPTS[choice]], { stdio: "inherit", env: childEnvironment(database) })
    return seed.status ?? 1
  }

  const database = databaseOrExit(target)

  if (choice === "migrate") {
    const code = await runMigrations(database, { skipConfirmation: flags.yes })
    if (code !== 0) log.error(`Migrations exited with code ${code}.`)
    else await showStatus()
    return code
  }

  log.info("Starting Drizzle Studio — press Ctrl+C to return.")
  return openStudio(database)
}

async function menu(): Promise<void> {
  while (true) {
    const choice = await select<Command | "exit">({
      message: "What would you like to do?",
      options: [
        { value: "status", label: "Status", hint: "migration ledger for local and prod" },
        { value: "migrate", label: "Run migrations", hint: `against ${target}` },
        { value: "studio", label: "Open Studio", hint: `against ${target}` },
        seedOption("seed-admin", "Seed admin"),
        seedOption("seed-users", "Seed users"),
        { value: "exit", label: "Exit" }
      ]
    })

    if (isCancel(choice) || choice === "exit") return

    await run(choice)
  }
}

/** Shown always, so the guardrail is visible rather than hidden when it applies. */
function seedOption(value: Command, label: string) {
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
