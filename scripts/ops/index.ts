#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { intro, isCancel, log, outro, select, spinner } from "@clack/prompts"
import { type DatabaseTarget, variableFor } from "@/core/config/database-url"
import { hasYesFlag } from "./guards"
import { statusFor, type TargetStatus } from "./migration-status"
import { runMigrations } from "./run-migrations"
import { targetOrExit } from "./target"

const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

const target = targetOrExit()

async function menu(): Promise<void> {
  while (true) {
    const choice = await select({
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
function seedOption(value: string, label: string) {
  return target === "local"
    ? { value, label, hint: "local only" }
    : { value, label: `${DIM}${label}${RESET}`, hint: "local only — disabled" }
}

async function run(choice: string): Promise<void> {
  if (choice === "status") return showStatus()

  if (choice === "seed-admin" || choice === "seed-users") {
    if (target !== "local") {
      log.error(`Seeding is local-only. Restart without DB_TARGET=prod to seed the local database.`)
      return
    }
    const script = choice === "seed-admin" ? "scripts/seed-admin.ts" : "scripts/seed-users.ts"
    spawnSync("bun", ["run", script], { stdio: "inherit" })
    return
  }

  if (choice === "migrate") {
    const code = await runMigrations({ skipConfirmation: hasYesFlag() })
    if (code !== 0) log.error(`Migrations exited with code ${code}.`)
    else await showStatus()
    return
  }

  if (choice === "studio") {
    log.info("Starting Drizzle Studio — press Ctrl+C to return.")
    spawnSync("bunx", ["drizzle-kit", "studio"], { stdio: "inherit" })
  }
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

function describe(target: DatabaseTarget, status: TargetStatus): string {
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
await showStatus()

// Without a terminal there is nobody to answer a prompt, so print the status and stop
// rather than blocking forever on a menu that cannot be drawn. `--status` asks for the
// same thing deliberately, which makes the status usable from a script or CI.
if (process.argv.includes("--status") || !process.stdin.isTTY) {
  outro("")
  process.exit(0)
}

await menu()
outro("Done.")
