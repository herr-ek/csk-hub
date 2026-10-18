import { ROUTES } from "@/core/navigation/site"
import type { EventViolation } from "../model"

/** Why an admin Events command failed: a rule the module enforces, bad form input, or anything else. */
export type EventCommandError = EventViolation | "invalid-input" | "unexpected"

export type EventCommandState =
  | { status: "idle" }
  // `completedAt` makes two successive successes distinct, so the form reacts to each one.
  | { status: "success"; completedAt: number }
  | { status: "error"; error: EventCommandError }

export const IDLE: EventCommandState = { status: "idle" }

/** The admin page of one Event, where it is edited and moved through its lifecycle. */
export function adminEventPath(eventId: string) {
  return `${ROUTES.adminEvents}/${eventId}`
}
