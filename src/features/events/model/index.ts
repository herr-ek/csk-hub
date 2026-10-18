import type { eventStatus, eventType, participationMode } from "@/core/db/schema/events"

export { type RehearsalKind, rehearsalKind } from "./rehearsal-kind"
export type { EventResult, EventViolation } from "./result"
export {
  addDays,
  type IsoDate,
  isIsoDate,
  isLocalDateTime,
  type LocalDateTime,
  stockholmDate,
  stockholmInstant,
  stockholmLocalDateTime
} from "./stockholm-time"

export type EventType = (typeof eventType.enumValues)[number]
export type EventStatus = (typeof eventStatus.enumValues)[number]
export type ParticipationMode = (typeof participationMode.enumValues)[number]

/** The Participation mode an Event of each type starts with, which the organiser may override. */
export const DEFAULT_PARTICIPATION_MODE: Record<EventType, ParticipationMode> = {
  Rehearsal: "ResponseRequiredStrict",
  Gig: "ResponseRequired",
  Concert: "ResponseRequiredStrict",
  Social: "Registration",
  Rephelg: "Registration",
  Körmöte: "ResponseRequired",
  Booking: "None",
  Meeting: "None",
  Other: "None"
}

/** Every Event type, in the order a picker offers them. */
export const EVENT_TYPES = Object.keys(DEFAULT_PARTICIPATION_MODE) as EventType[]

export const PARTICIPATION_MODES: readonly ParticipationMode[] = [
  "None",
  "ResponseRequired",
  "ResponseRequiredStrict",
  "Registration"
]

export const EVENT_STATUSES: readonly EventStatus[] = ["Draft", "Published", "Cancelled"]

/** The types with an extension row of their own fields. The others have none. */
export type ExtendedEventType = Extract<EventType, "Rehearsal" | "Gig" | "Social">

export function hasExtension(type: EventType): type is ExtendedEventType {
  return type === "Rehearsal" || type === "Gig" || type === "Social"
}

/** Whether the mode collects anything in advance, and so whether a respond-by deadline means anything. */
export function collectsParticipation(mode: ParticipationMode) {
  return mode !== "None"
}

/**
 * The lifecycle: a Draft is published, a Published Event can be cancelled, and a Cancelled one
 * reinstated. A Published Event never returns to Draft.
 */
const STATUS_CHANGES: Record<EventStatus, readonly EventStatus[]> = {
  Draft: ["Published"],
  Published: ["Cancelled"],
  Cancelled: ["Published"]
}

/** The statuses an Event in `status` can move to. */
export function statusChangesFrom(status: EventStatus): readonly EventStatus[] {
  return STATUS_CHANGES[status]
}
