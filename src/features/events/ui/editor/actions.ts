"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/core/db"
import { ROUTES } from "@/core/navigation/site"
import { createEvent, updateEvent } from "../../events"
import { changeEventStatus, deleteEvent } from "../../lifecycle"
import { EVENT_STATUSES, type EventStatus } from "../../model"
import { adminEventPath, type EventCommandState } from "../command-state"
import { runEventsCommand } from "../run-command"
import { eventFormSchema, readEventForm } from "./form-input"

/** Creates a Draft from the form and opens its admin page. */
export async function createEventAction(_state: EventCommandState, formData: FormData): Promise<EventCommandState> {
  const { state, data } = await runEventsCommand("create", eventFormSchema, readEventForm(formData), (input, actorId) =>
    createEvent(db, { ...input, createdBy: actorId })
  )
  if (!data) return state
  redirect(adminEventPath(data.id))
}

/** Saves the whole form onto the Event. */
export async function updateEventAction(
  eventId: string,
  _state: EventCommandState,
  formData: FormData
): Promise<EventCommandState> {
  const schema = z.object({ eventId: z.uuid(), input: eventFormSchema })
  const { state } = await runEventsCommand("update", schema, { eventId, input: readEventForm(formData) }, (form) =>
    updateEvent(db, form.eventId, form.input)
  )
  return state
}

const statusChangeSchema = z.object({
  eventId: z.uuid(),
  status: z.enum(EVENT_STATUSES as [EventStatus, ...EventStatus[]])
})

/** Publishes, cancels or reinstates the Event, by the status the form names. */
export async function changeEventStatusAction(
  _state: EventCommandState,
  formData: FormData
): Promise<EventCommandState> {
  const values = { eventId: formData.get("eventId"), status: formData.get("status") }
  const { state } = await runEventsCommand("change-status", statusChangeSchema, values, (input) =>
    changeEventStatus(db, input.eventId, input.status)
  )
  return state
}

/** Deletes the Event with everything recorded for it, and returns to the list. */
export async function deleteEventAction(_state: EventCommandState, formData: FormData): Promise<EventCommandState> {
  const schema = z.object({ eventId: z.uuid() })
  const { state } = await runEventsCommand("delete", schema, { eventId: formData.get("eventId") }, (input) =>
    deleteEvent(db, input.eventId)
  )
  if (state.status !== "success") return state
  redirect(ROUTES.adminEvents)
}
