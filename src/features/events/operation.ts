import "server-only"

import type { db } from "@/core/db"
import type { EventResult, EventViolation } from "./model"

/** The application database client, or a transaction on it. Every Events command accepts either. */
export type EventsDatabase = typeof db | EventsTransaction

export type EventsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Raised inside a command to roll it back; `runEventCommand` turns it into a result. */
export class RuleViolation extends Error {
  constructor(readonly kind: EventViolation) {
    super(kind)
    this.name = "RuleViolation"
  }
}

/**
 * Constraints and triggers the database checks on the module's behalf, and the rule each one
 * stands for. The triggers name a constraint when they raise, so they map the same way. A race
 * between two commands ends here rather than in a raw constraint error.
 */
const CONSTRAINT_VIOLATIONS: Record<string, EventViolation> = {
  event_title_not_blank_check: "title-required",
  event_period_check: "ends-before-start",
  event_call_time_check: "call-time-after-start",
  event_respond_by_check: "respond-by-after-start",
  event_respond_by_mode_check: "respond-by-without-participation",
  event_participation_mode_change_check: "participation-mode-locked",
  event_location_id_location_id_fk: "location-not-found",
  event_organiser_group_id_group_id_fk: "organiser-group-not-found",
  event_detail_event_id_event_id_fk: "event-not-found",
  event_detail_label_not_blank_check: "detail-incomplete",
  event_target_event_id_event_id_fk: "event-not-found",
  event_target_group_id_group_id_fk: "target-group-not-found",
  event_target_not_empty_check: "target-empty",
  event_target_unique: "target-duplicate",
  rehearsal_event_id_type_event_id_type_fk: "event-not-found",
  rehearsal_leader_user_id_user_id_fk: "user-not-found",
  gig_event_id_type_event_id_type_fk: "event-not-found",
  gig_responsible_user_id_user_id_fk: "user-not-found",
  social_event_event_id_type_event_id_type_fk: "event-not-found",
  location_name_active_unique: "location-name-taken",
  location_name_not_blank_check: "location-name-required"
}

function violationOf(error: unknown): EventViolation | undefined {
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
export async function runEventCommand<T>(
  database: EventsDatabase,
  command: (tx: EventsTransaction) => Promise<T>
): Promise<EventResult<T>> {
  try {
    return { success: true, data: await database.transaction(command) }
  } catch (error) {
    const kind = violationOf(error)
    if (kind) return { success: false, error: kind }
    throw error
  }
}

/** Optional free text, trimmed; blank is absent. */
export function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
