import { ROUTES } from "@/core/navigation/site"
import type { CommandState } from "@/shared/forms/command-state"
import type { EventViolation } from "../model"

/** Why an admin Events command failed: a rule the module enforces, bad form input, or anything else. */
export type EventCommandError = EventViolation | "invalid-input" | "unexpected"

export type EventCommandState = CommandState<EventCommandError>

/** The admin page of one Event, where it is edited and moved through its lifecycle. */
export function adminEventPath(eventId: string) {
  return `${ROUTES.adminEvents}/${eventId}`
}
