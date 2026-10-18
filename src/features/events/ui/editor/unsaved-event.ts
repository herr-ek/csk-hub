import { eventDocument } from "../../event-document"
import { EVENT_TYPES, type EventType, PARTICIPATION_MODES, type ParticipationMode } from "../../model"
import { rows } from "./form-input"
import type { EventFormValues } from "./query"

// The Event form's unsaved copy, kept in the tab's session storage by `useUnsavedForm` so a
// reload does not lose it. The copy is the form's own values, read off the form element.

const TEXT_FIELDS = [
  "title",
  "startsAt",
  "endsAt",
  "firstDay",
  "lastDay",
  "callTime",
  "respondBy",
  "locationId",
  "locationText",
  "organiserGroupId",
  "leaderUserId",
  "responsibleUserId",
  "contactName",
  "contactDetails",
  "costInfo"
] as const satisfies readonly (keyof EventFormValues)[]

function isEventType(value: unknown): value is EventType {
  return EVENT_TYPES.includes(value as EventType)
}

function isParticipationMode(value: unknown): value is ParticipationMode {
  return PARTICIPATION_MODES.includes(value as ParticipationMode)
}

/**
 * What the form holds now. A field the form does not show at the moment, such as the last day of
 * a timed Event or a Gig's contact on a Rehearsal, keeps its value from `base`, so switching back
 * brings it back.
 */
export function snapshotEventForm(form: HTMLFormElement, base: EventFormValues): EventFormValues {
  const data = new FormData(form)
  const snapshot: EventFormValues = { ...base }
  for (const field of TEXT_FIELDS) {
    const value = data.get(field)
    if (typeof value === "string") snapshot[field] = value
  }
  const type = data.get("type")
  if (isEventType(type)) snapshot.type = type
  const mode = data.get("participationMode")
  if (isParticipationMode(mode)) snapshot.participationMode = mode
  snapshot.allDay = data.get("allDay") === "true"
  const description = data.get("description")
  if (typeof description === "string") snapshot.description = eventDocument.parse(description)
  snapshot.targets = rows(data, "target").map((row) => ({
    groupId: row.groupId ?? "",
    voiceFamily: row.voiceFamily ?? ""
  }))
  snapshot.details = rows(data, "detail").map((row) => ({ label: row.label ?? "", value: row.value ?? "" }))
  return snapshot
}

/** A stored copy as form values, or null for one this form could not have written. */
export function parseStoredEvent(value: unknown): EventFormValues | null {
  if (typeof value !== "object" || value === null) return null
  const stored = value as Record<string, unknown>
  if (!isEventType(stored.type) || !isParticipationMode(stored.participationMode)) return null
  const text = (field: string) => (typeof stored[field] === "string" ? (stored[field] as string) : "")
  const list = (field: string) =>
    Array.isArray(stored[field])
      ? (stored[field] as unknown[]).filter(
          (row): row is Record<string, unknown> => typeof row === "object" && row !== null
        )
      : []

  return {
    ...(Object.fromEntries(TEXT_FIELDS.map((field) => [field, text(field)])) as Pick<
      EventFormValues,
      (typeof TEXT_FIELDS)[number]
    >),
    type: stored.type,
    participationMode: stored.participationMode,
    allDay: stored.allDay === true,
    description: eventDocument.normalize(stored.description),
    targets: list("targets").map((row) => ({
      groupId: typeof row.groupId === "string" ? row.groupId : "",
      voiceFamily: typeof row.voiceFamily === "string" ? row.voiceFamily : ""
    })),
    details: list("details").map((row) => ({
      label: typeof row.label === "string" ? row.label : "",
      value: typeof row.value === "string" ? row.value : ""
    }))
  }
}

/**
 * A short fingerprint of the saved Event the form was loaded from. Events keep no edit time, so
 * the content itself tells a copy of an older version apart from one of the current.
 */
export function eventFormVersion(values: EventFormValues) {
  const text = JSON.stringify(values)
  // FNV-1a: cheap, stable, and plenty to tell two versions of one Event apart.
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
