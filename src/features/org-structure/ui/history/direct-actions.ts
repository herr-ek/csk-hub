"use server"

import { z } from "zod"
import { shiftDate } from "@/core/org-structure"
import {
  addDirectMembership,
  changeDirectMembership,
  correctDirectMembership,
  endDirectMembership
} from "../../direct-membership"
import { endMembership } from "../../membership"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const periodFields = {
  groupId: fields.id,
  startDate: fields.date,
  lastDay: fields.date.optional(),
  voice: fields.voice.optional(),
  voiceFamily: fields.voiceFamily.optional()
}

function periodValues(formData: FormData) {
  return {
    groupId: value(formData, "groupId"),
    startDate: value(formData, "startDate"),
    lastDay: value(formData, "lastDay"),
    voice: value(formData, "voice"),
    voiceFamily: value(formData, "voiceFamily")
  }
}

const addSchema = z.object({ ...periodFields, userId: fields.userId })

export async function addDirectMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "add-direct-member",
    addSchema,
    { ...periodValues(formData), userId: value(formData, "userId") },
    ({ lastDay, ...input }, tx) =>
      addDirectMembership(tx, { ...input, endDate: lastDay ? shiftDate(lastDay, 1) : undefined })
  )
}

const correctionSchema = z.object({ ...periodFields, membershipId: fields.id })

export async function correctDirectMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "correct-direct-member",
    correctionSchema,
    { ...periodValues(formData), membershipId: value(formData, "membershipId") },
    ({ lastDay, ...input }, tx) =>
      correctDirectMembership(tx, { ...input, endDate: lastDay ? shiftDate(lastDay, 1) : null })
  )
}

const changeSchema = z.object({ ...periodFields, membershipId: fields.id })

export async function changeDirectMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "change-direct-member",
    changeSchema,
    { ...periodValues(formData), membershipId: value(formData, "membershipId") },
    ({ lastDay, startDate, voiceFamily: _voiceFamily, ...input }, tx) =>
      changeDirectMembership(tx, { ...input, date: startDate, endDate: lastDay ? shiftDate(lastDay, 1) : null })
  )
}

const endSchema = z.object({ membershipId: fields.id, lastDay: fields.date })

export async function endDirectMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "end-direct-member",
    endSchema,
    { membershipId: value(formData, "membershipId"), lastDay: value(formData, "lastDay") },
    (input, tx) => endDirectMembership(tx, { membershipId: input.membershipId, endDate: shiftDate(input.lastDay, 1) })
  )
}

const endChoirMemberSchema = z.object({
  membershipId: fields.id,
  groupId: fields.id,
  userId: fields.userId,
  lastDay: fields.date
})

/** Leaves the Choir and its dependent singer/team periods through one atomic domain command. */
export async function endChoirMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "end-membership",
    endChoirMemberSchema,
    {
      membershipId: value(formData, "membershipId"),
      groupId: value(formData, "groupId"),
      userId: value(formData, "userId"),
      lastDay: value(formData, "lastDay")
    },
    ({ lastDay, ...input }, tx) => endMembership(tx, { ...input, endDate: shiftDate(lastDay, 1) })
  )
}
