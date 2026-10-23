/**
 * Why an Events command was refused. Every rule the module enforces, and every constraint or
 * trigger the database enforces on its behalf, surfaces as one of these rather than as a thrown
 * error.
 */
export type EventViolation =
  | "event-not-found"
  | "title-required"
  | "description-invalid"
  | "invalid-date"
  | "ends-before-start"
  | "call-time-after-start"
  | "respond-by-after-start"
  | "respond-by-without-participation"
  | "participation-mode-locked"
  | "status-change-not-allowed"
  | "location-not-found"
  | "location-archived"
  | "location-name-required"
  | "location-name-taken"
  | "invalid-map-url"
  | "organiser-group-not-found"
  | "organiser-group-archived"
  | "target-group-not-found"
  | "target-group-archived"
  | "target-empty"
  | "target-duplicate"
  | "detail-incomplete"
  | "user-not-found"

export type EventResult<T> = { success: true; data: T } | { success: false; error: EventViolation }
