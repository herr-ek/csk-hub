import "server-only"

import { sql } from "drizzle-orm"
import type { db } from "@/core/db"
import type { IsoDate, OrgStructureResult, OrgStructureViolation } from "@/core/org-structure"

/** The application database client, or a transaction on it. Every groups command accepts either. */
export type OrgStructureDatabase = typeof db | OrgStructureTransaction

export type OrgStructureTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Raised inside a command to roll it back; `runOrgStructureCommand` turns it into a result. */
export class RuleViolation extends Error {
  constructor(readonly kind: OrgStructureViolation) {
    super(kind)
    this.name = "RuleViolation"
  }
}

/**
 * Constraints the database checks on the module's behalf, and the rule each one stands for.
 * A race between two commands ends here rather than in a raw constraint error.
 */
const CONSTRAINT_VIOLATIONS: Record<string, OrgStructureViolation> = {
  group_annual_active_check: "annual-group-lifecycle-derived",
  group_annual_identity_unique: "group-name-taken",
  group_continuing_singleton_unique: "group-name-taken",
  group_choir_team_unique: "group-name-taken",
  group_organisation_policy_check: "position-not-allowed",
  group_organisation_year_check: "period-conflict",
  position_appointment_occupancy_excl: "position-taken",
  position_appointment_board_excl: "already-holding-elected-post",
  position_appointment_period_check: "period-conflict",
  position_appointment_year_check: "period-conflict",
  position_appointment_policy_check: "position-not-allowed",
  position_appointment_annual_check: "period-conflict",
  direct_membership_overlap_excl: "already-member",
  direct_membership_period_check: "period-conflict",
  direct_membership_annual_check: "period-conflict",
  direct_membership_policy_check: "position-not-allowed",
  direct_membership_voice_check: "voice-not-sung-in-section",
  group_name_policy_check: "invalid-group-name",
  group_name_choir_active_unique: "group-name-taken"
}

function violationOf(error: unknown): OrgStructureViolation | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof RuleViolation) return current.kind
    const constraint = (current as { constraint?: unknown }).constraint
    if (typeof constraint === "string" && constraint in CONSTRAINT_VIOLATIONS) return CONSTRAINT_VIOLATIONS[constraint]
  }
  return undefined
}

/**
 * Runs one command atomically. Given a transaction, it nests as a savepoint, so a refused command
 * leaves the caller's transaction usable.
 */
export async function runOrgStructureCommand<T>(
  database: OrgStructureDatabase,
  command: (tx: OrgStructureTransaction) => Promise<T>
): Promise<OrgStructureResult<T>> {
  try {
    return { success: true, data: await database.transaction(command) }
  } catch (error) {
    const kind = violationOf(error)
    if (kind) return { success: false, error: kind }
    throw error
  }
}

/**
 * Serializes commands that change one user's Memberships or Positions, so check-then-write rules
 * such as "one Section per Choir" hold under concurrent requests.
 */
export async function lockUser(tx: OrgStructureTransaction, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:user:${userId}`}))`)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function requireDate(value: IsoDate): IsoDate {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new RuleViolation("invalid-date")
  // Date.parse accepts 2026-02-31 by rolling it over; a round trip catches that.
  if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new RuleViolation("invalid-date")
  return value
}
