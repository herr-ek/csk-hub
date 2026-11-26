"use server"

import { z } from "zod"
import { POSITION_DEFINITIONS, shiftDate } from "@/core/org-structure"
import { appointPosition, correctAnnualAppointment, correctFluidAppointment } from "../../appointments"
import { addDirectMembership, correctDirectMembership } from "../../direct-membership"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const membershipFields = {
  groupId: fields.id,
  startDate: fields.date,
  lastDay: fields.date.optional(),
  voice: fields.voice.optional(),
  voiceFamily: fields.voiceFamily.optional()
}

function membershipValues(formData: FormData) {
  return {
    groupId: value(formData, "groupId"),
    startDate: value(formData, "startDate"),
    lastDay: value(formData, "lastDay"),
    voice: value(formData, "voice"),
    voiceFamily: value(formData, "voiceFamily")
  }
}

/** Adds participation that was never recorded. */
export async function recordMembershipAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "record-membership",
    z.object({ ...membershipFields, userId: fields.userId }),
    { ...membershipValues(formData), userId: value(formData, "userId") },
    ({ lastDay, ...input }, tx) =>
      addDirectMembership(tx, { ...input, endDate: lastDay ? shiftDate(lastDay, 1) : undefined })
  )
}

/** Corrects the dates, Voice or Section of recorded participation. */
export async function correctMembershipAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "correct-membership",
    z.object({ ...membershipFields, membershipId: fields.id }),
    { ...membershipValues(formData), membershipId: value(formData, "membershipId") },
    ({ lastDay, ...input }, tx) =>
      correctDirectMembership(tx, { ...input, endDate: lastDay ? shiftDate(lastDay, 1) : null })
  )
}

const tenureFields = {
  userId: fields.userId,
  positionCode: fields.positionCode,
  contextGroupId: fields.id,
  organisationYear: fields.organisationYear.optional(),
  startDate: fields.date,
  lastDay: fields.date.optional()
}

function tenureValues(formData: FormData) {
  return {
    userId: value(formData, "userId"),
    positionCode: value(formData, "positionCode"),
    contextGroupId: value(formData, "contextGroupId"),
    organisationYear: value(formData, "organisationYear"),
    startDate: value(formData, "startDate"),
    lastDay: value(formData, "lastDay")
  }
}

/** Adds a tenure that was never recorded, where nobody else is recorded. */
export async function recordTenureAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "record-tenure",
    z.object(tenureFields),
    tenureValues(formData),
    ({ lastDay, organisationYear, ...input }, tx) =>
      appointPosition(tx, {
        ...input,
        organisationYear:
          POSITION_DEFINITIONS[input.positionCode].endPolicy === "annual" ? organisationYear : undefined,
        endDate: lastDay ? shiftDate(lastDay, 1) : undefined
      })
  )
}

/** Corrects the person, Position, place or dates of a recorded tenure. An annual one needs its year and last day. */
export async function correctTenureAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "correct-tenure",
    z.object({ ...tenureFields, appointmentId: fields.id }),
    { ...tenureValues(formData), appointmentId: value(formData, "appointmentId") },
    async ({ lastDay, organisationYear, ...input }, tx) => {
      const endDate = lastDay ? shiftDate(lastDay, 1) : null
      if (POSITION_DEFINITIONS[input.positionCode].endPolicy === "fluid")
        return correctFluidAppointment(tx, { ...input, endDate })
      if (organisationYear === undefined || endDate === null) return { success: false, error: "period-conflict" }
      return correctAnnualAppointment(tx, { ...input, organisationYear, endDate })
    }
  )
}
