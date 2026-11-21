"use server"

import { z } from "zod"
import { rsvpAnswer } from "@/core/db/schema/events"
import { respondToEvent } from "../responses"
import type { EventCommandState } from "../ui/command-state"
import { LONG_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from "../ui/limits"
import { runEventsCommand } from "../ui/run-command"
import { OTHER_REASON } from "./response-form"

const responseSchema = z.object({
  eventId: z.uuid(),
  answer: z.enum(rsvpAnswer.enumValues),
  comment: z.string().max(LONG_TEXT_MAX_LENGTH).optional(),
  absenceReasonId: z.uuid().optional(),
  reasonText: z.string().max(SHORT_TEXT_MAX_LENGTH).optional()
})

function readResponse(formData: FormData) {
  const text = (name: string) => {
    const raw = formData.get(name)
    return typeof raw === "string" ? raw : undefined
  }
  // The picker holds a preset reason's id, "other" for the User's own words, or nothing.
  const reason = text("reason") || undefined
  return {
    eventId: text("eventId"),
    answer: text("answer"),
    comment: text("comment"),
    absenceReasonId: reason === OTHER_REASON ? undefined : reason,
    reasonText: reason === OTHER_REASON ? text("reasonText") : undefined
  }
}

/**
 * The signed-in User's Response to an Event. Only active identity is required here: the module
 * refuses anyone outside the Audience, so posting to the action directly gains nothing.
 */
export async function respondToEventAction(_state: EventCommandState, formData: FormData) {
  const { state } = await runEventsCommand(
    "respond",
    responseSchema,
    readResponse(formData),
    ({ eventId, ...response }, userId, database) => respondToEvent(database, userId, eventId, response),
    "app.access"
  )
  return state
}
