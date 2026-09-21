#!/usr/bin/env bun
import { hasYesFlag } from "./guards"
import { runMigrations } from "./run-migrations"

/**
 * Entry point for `bun run db:migrate`.
 *
 * Wrapping drizzle-kit rather than calling it directly is what makes the production
 * confirmation reachable from the everyday command, instead of only from the ops CLI.
 */
process.exit(await runMigrations({ skipConfirmation: hasYesFlag() }))
