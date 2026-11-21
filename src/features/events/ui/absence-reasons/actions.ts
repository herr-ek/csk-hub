"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { archiveAbsenceReason, createAbsenceReason, renameAbsenceReason } from "../../responses"
import type { EventCommandState } from "../command-state"
import { SHORT_TEXT_MAX_LENGTH } from "../limits"
import { runEventsCommand } from "../run-command"

// A blank label is the module's to refuse, so its violation names it.
const labelSchema = z.string().max(SHORT_TEXT_MAX_LENGTH)

function label(formData: FormData) {
  const raw = formData.get("label")
  return typeof raw === "string" ? raw : ""
}

export async function createAbsenceReasonAction(_state: EventCommandState, formData: FormData) {
  const { state } = await runEventsCommand(
    "create-absence-reason",
    z.object({ label: labelSchema }),
    { label: label(formData) },
    (input) => createAbsenceReason(db, input)
  )
  return state
}

export async function renameAbsenceReasonAction(_state: EventCommandState, formData: FormData) {
  const values = { reasonId: formData.get("reasonId"), label: label(formData) }
  const { state } = await runEventsCommand(
    "rename-absence-reason",
    z.object({ reasonId: z.uuid(), label: labelSchema }),
    values,
    (input) => renameAbsenceReason(db, input.reasonId, input)
  )
  return state
}

export async function archiveAbsenceReasonAction(_state: EventCommandState, formData: FormData) {
  const { state } = await runEventsCommand(
    "archive-absence-reason",
    z.object({ reasonId: z.uuid() }),
    { reasonId: formData.get("reasonId") },
    (input) => archiveAbsenceReason(db, input.reasonId)
  )
  return state
}
