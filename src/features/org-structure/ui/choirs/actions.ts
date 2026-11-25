"use server"

import { z } from "zod"
import { shiftDate } from "@/core/org-structure"
import { changeVoice, endMembership, placeSinger } from "../../membership"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const singerFields = { userId: fields.userId, choirId: fields.id }

function singerValues(formData: FormData) {
  return { userId: value(formData, "userId"), choirId: value(formData, "choirId") }
}

/** Places a singer in the Section of a Choir that sings their Voice. */
export async function placeSingerAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "place-singer",
    z.object({ ...singerFields, voice: fields.voice, startDate: fields.date }),
    { ...singerValues(formData), voice: value(formData, "voice"), startDate: value(formData, "startDate") },
    (input, tx) => placeSinger(tx, input)
  )
}

/** Set only by a form that has told the Admin which Positions the change ends. */
const endAppointments = z.literal("true").optional()

/** Changes a singer's Voice, and their Section when another one sings it. */
export async function changeVoiceAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "change-voice",
    z.object({ ...singerFields, voice: fields.voice, startDate: fields.date, endAppointments }),
    {
      ...singerValues(formData),
      voice: value(formData, "voice"),
      startDate: value(formData, "startDate"),
      endAppointments: value(formData, "endAppointments")
    },
    ({ startDate, endAppointments, ...input }, tx) =>
      changeVoice(tx, { ...input, date: startDate, endAppointments: endAppointments === "true" })
  )
}

/** Leaves a Choir and its Section after a last day. */
export async function leaveChoirAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "leave-choir",
    z.object({ ...singerFields, lastDay: fields.date, endAppointments }),
    {
      ...singerValues(formData),
      lastDay: value(formData, "lastDay"),
      endAppointments: value(formData, "endAppointments")
    },
    ({ userId, choirId, lastDay, endAppointments }, tx) =>
      endMembership(tx, {
        userId,
        groupId: choirId,
        endDate: shiftDate(lastDay, 1),
        endAppointments: endAppointments === "true"
      })
  )
}
