"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { shiftDate } from "@/core/org-structure"
import {
  appointPosition,
  cancelPreparedAppointment,
  correctAnnualAppointment,
  endAppointment,
  replaceAppointmentHolder
} from "../../appointments"
import { cskToday } from "../../effective-reads"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const assignSchema = z.object({
  userId: fields.userId,
  positionCode: fields.positionCode,
  contextGroupId: fields.id,
  organisationYear: z.coerce.number().int().min(1000).max(9998),
  startDate: fields.date,
  lastDay: fields.date.optional()
})

export async function assignAppointmentAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "assign-appointment",
    assignSchema,
    {
      userId: value(formData, "userId"),
      positionCode: value(formData, "positionCode"),
      contextGroupId: value(formData, "contextGroupId"),
      organisationYear: value(formData, "organisationYear"),
      startDate: value(formData, "startDate"),
      lastDay: value(formData, "lastDay")
    },
    ({ lastDay, ...input }) =>
      appointPosition(db, {
        ...input,
        endDate: lastDay ? shiftDate(lastDay, 1) : undefined
      })
  )
}

export async function replaceAppointmentAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "replace-appointment",
    assignSchema,
    {
      userId: value(formData, "userId"),
      positionCode: value(formData, "positionCode"),
      contextGroupId: value(formData, "contextGroupId"),
      organisationYear: value(formData, "organisationYear"),
      startDate: value(formData, "startDate"),
      lastDay: value(formData, "lastDay")
    },
    ({ lastDay, ...input }) =>
      replaceAppointmentHolder(db, {
        ...input,
        endDate: lastDay ? shiftDate(lastDay, 1) : undefined
      })
  )
}

const endSchema = z.object({ appointmentId: fields.id, lastDay: fields.date })
export async function endAppointmentAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "end-appointment",
    endSchema,
    {
      appointmentId: value(formData, "appointmentId"),
      lastDay: value(formData, "lastDay")
    },
    ({ appointmentId, lastDay }) => endAppointment(db, { appointmentId, endDate: shiftDate(lastDay, 1) })
  )
}

const correctionSchema = z.object({
  appointmentId: fields.id,
  userId: fields.userId,
  positionCode: fields.positionCode,
  contextGroupId: fields.id,
  organisationYear: z.coerce.number().int().min(1000).max(9998),
  startDate: fields.date,
  lastDay: fields.date
})
export async function correctAppointmentAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "correct-appointment",
    correctionSchema,
    {
      appointmentId: value(formData, "appointmentId"),
      userId: value(formData, "userId"),
      positionCode: value(formData, "positionCode"),
      contextGroupId: value(formData, "contextGroupId"),
      organisationYear: value(formData, "organisationYear"),
      startDate: value(formData, "startDate"),
      lastDay: value(formData, "lastDay")
    },
    ({ lastDay, ...input }) =>
      correctAnnualAppointment(db, {
        ...input,
        endDate: shiftDate(lastDay, 1)
      })
  )
}

const cancelSchema = z.object({ appointmentId: fields.id })
export async function cancelAppointmentAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "cancel-appointment",
    cancelSchema,
    {
      appointmentId: value(formData, "appointmentId")
    },
    ({ appointmentId }) => cancelPreparedAppointment(db, { appointmentId, today: cskToday() })
  )
}
