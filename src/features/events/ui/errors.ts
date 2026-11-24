import { useTranslations } from "@/core/i18n/translations"
import type { EventCommandError } from "./command-state"

/** The part of the Event form a failure is shown next to; `form` is below the form as a whole. */
export type EventFormField =
  | "form"
  | "title"
  | "description"
  | "schedule"
  | "callTime"
  | "participationMode"
  | "respondBy"
  | "location"
  | "organiserGroup"
  | "extension"
  | "targets"
  | "details"

/**
 * Where each failure belongs on the Event form. A new violation fails the typecheck here until it
 * has a place, as it does in the message catalogues.
 */
export const ERROR_FIELD: Record<EventCommandError, EventFormField> = {
  "event-not-found": "form",
  "title-required": "title",
  "description-invalid": "description",
  "invalid-date": "schedule",
  "ends-before-start": "schedule",
  "call-time-after-start": "callTime",
  "respond-by-after-start": "respondBy",
  // The deadline is hidden once the mode collects nothing, so the mode is where to fix it.
  "respond-by-without-participation": "participationMode",
  "participation-mode-locked": "participationMode",
  "status-change-not-allowed": "form",
  "location-not-found": "location",
  "location-archived": "location",
  "location-name-required": "form",
  "location-name-taken": "form",
  "invalid-map-url": "form",
  "organiser-group-not-found": "organiserGroup",
  "organiser-group-archived": "organiserGroup",
  "target-group-not-found": "targets",
  "target-group-archived": "targets",
  "target-empty": "targets",
  "target-duplicate": "targets",
  "detail-incomplete": "details",
  "user-not-found": "extension",
  // Responses and Absence reasons have one-field forms of their own, so all show below them.
  "not-in-audience": "form",
  "responses-closed": "form",
  "event-started": "form",
  "maybe-not-allowed": "form",
  "absence-reason-required": "form",
  "absence-reason-conflict": "form",
  "reason-only-with-no": "form",
  "absence-reason-not-found": "form",
  "absence-reason-archived": "form",
  "absence-reason-label-required": "form",
  "absence-reason-label-taken": "form",
  // The rehearsal generator shows every failure below itself.
  "last-day-before-first": "form",
  "date-in-past": "form",
  "no-dates": "form",
  "too-many-dates": "form",
  "series-name-required": "form",
  "not-a-choir": "form",
  "invalid-input": "form",
  "access-denied": "form",
  unexpected: "form"
}

/** A translated message for every way an admin Events command can fail. */
export function useEventErrorMessage() {
  const t = useTranslations("Events.errors")
  return (error: EventCommandError) => t(error)
}
