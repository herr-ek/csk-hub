import "server-only"

import { sql } from "drizzle-orm"
import type { db } from "@/core/db"
import type { IsoDate, OrgStructureResult, OrgStructureViolation } from "./model"

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
  group_name_choir_active_unique: "group-name-taken",
  group_member_current_unique: "already-member",
  group_member_user_id_group_id_start_date_pk: "period-conflict",
  group_member_period_check: "period-conflict",
  group_member_voice_containment_check: "voice-not-sung-in-section",
  position_name_unique: "position-name-taken",
  position_holder_current_unique: "position-taken",
  position_holder_user_id_group_id_position_id_start_date_pk: "period-conflict",
  position_holder_period_check: "period-conflict"
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
