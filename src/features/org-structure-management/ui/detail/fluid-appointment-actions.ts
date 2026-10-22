"use server"

import { z } from "zod"
import { db } from "@/core/db"
import type { PositionCode } from "@/core/org-structure"
import { shiftDate } from "@/core/org-structure"
import { correctFluidAppointment, endAppointment, replaceAppointmentHolder } from "../../appointments"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const schema = z.object({
  userId: fields.userId,
  positionCode: z.string().min(1),
  contextGroupId: fields.id,
  startDate: fields.date,
  lastDay: fields.date.optional()
})

function inputFrom(formData: FormData) {
  return {
    userId: value(formData, "userId"),
    positionCode: value(formData, "positionCode"),
    contextGroupId: value(formData, "contextGroupId"),
    startDate: value(formData, "startDate"),
    lastDay: value(formData, "lastDay")
  }
}

export async function assignFluidAppointmentAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand("assign-appointment", schema, inputFrom(formData), ({ lastDay, ...input }) =>
    replaceAppointmentHolder(db, {
      ...input,
      positionCode: input.positionCode as PositionCode,
      endDate: lastDay ? shiftDate(lastDay, 1) : undefined
    })
  )
}

export async function correctFluidAppointmentAction(_state: GroupCommandState, formData: FormData) {
  const correctionSchema = schema.extend({ appointmentId: fields.id })
  return runGroupCommand(
    "correct-appointment",
    correctionSchema,
    { ...inputFrom(formData), appointmentId: value(formData, "appointmentId") },
    ({ lastDay, ...input }) =>
      correctFluidAppointment(db, {
        ...input,
        positionCode: input.positionCode as PositionCode,
        endDate: lastDay ? shiftDate(lastDay, 1) : null
      })
  )
}

export async function endFluidAppointmentAction(_state: GroupCommandState, formData: FormData) {
  const endSchema = z.object({ appointmentId: fields.id, lastDay: fields.date })
  return runGroupCommand(
    "end-appointment",
    endSchema,
    { appointmentId: value(formData, "appointmentId"), lastDay: value(formData, "lastDay") },
    ({ appointmentId, lastDay }) => endAppointment(db, { appointmentId, endDate: shiftDate(lastDay, 1) })
  )
}
