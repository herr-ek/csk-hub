"use server"

import { z } from "zod"
import { shiftDate } from "@/core/org-structure"
import { cancelPreparedAppointment, endAppointment } from "../../appointments"
import { cskToday } from "../../effective-reads"
import { fillPosition } from "../../year-commands"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const fillSchema = z.object({
  userId: fields.userId,
  positionCode: fields.positionCode,
  contextGroupId: fields.id.optional(),
  organisationYear: fields.organisationYear.optional(),
  replaces: fields.id.optional(),
  startDate: fields.date,
  lastDay: fields.date.optional()
})

/** Appoints, replaces or plans the holder of one Position. */
export async function fillPositionAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "fill-position",
    fillSchema,
    {
      userId: value(formData, "userId"),
      positionCode: value(formData, "positionCode"),
      contextGroupId: value(formData, "contextGroupId"),
      organisationYear: value(formData, "organisationYear"),
      replaces: value(formData, "replaces"),
      startDate: value(formData, "startDate"),
      lastDay: value(formData, "lastDay")
    },
    ({ lastDay, ...input }, tx) => fillPosition(tx, { ...input, endDate: lastDay ? shiftDate(lastDay, 1) : undefined })
  )
}

const vacateSchema = z.object({ appointmentId: fields.id, lastDay: fields.date.optional() })

/** Ends a holder's tenure on its last day. Without one, removes a holder who has not begun before today. */
export async function vacatePositionAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "vacate-position",
    vacateSchema,
    { appointmentId: value(formData, "appointmentId"), lastDay: value(formData, "lastDay") },
    ({ appointmentId, lastDay }, tx) =>
      lastDay
        ? endAppointment(tx, { appointmentId, endDate: shiftDate(lastDay, 1) })
        : cancelPreparedAppointment(tx, { appointmentId, today: cskToday() })
  )
}
