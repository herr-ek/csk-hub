"use server"

import { z } from "zod"
import { GroupType, shiftDate } from "@/core/org-structure"
import { changeVoice, endMembership, placeSingerInSection, startMembership } from "../../membership"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"
import { getChoirIdOf, getGroupTypeOf } from "./query"

const addMemberSchema = z.object({
  groupId: fields.id,
  userId: fields.userId,
  startDate: fields.date,
  // Required for Sections and gig groups; the domain command checks the actual Group type.
  voice: fields.voice.optional()
})

/** Adds direct participation with a required Voice for Sections and gig groups. */
export async function addMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "add-member",
    addMemberSchema,
    {
      groupId: value(formData, "groupId"),
      userId: value(formData, "userId"),
      startDate: value(formData, "startDate"),
      voice: value(formData, "voice")
    },
    async (input, tx) => {
      if (input.voice && (await getGroupTypeOf(input.groupId)) !== GroupType.GigGroup) {
        return placeSingerInSection(tx, {
          userId: input.userId,
          sectionId: input.groupId,
          voice: input.voice,
          startDate: input.startDate
        })
      }
      return startMembership(tx, input)
    }
  )
}

const endMembershipSchema = z.object({ groupId: fields.id, userId: fields.userId, endDate: fields.date })

export async function endMembershipAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "end-membership",
    endMembershipSchema,
    { groupId: value(formData, "groupId"), userId: value(formData, "userId"), endDate: value(formData, "endDate") },
    (input, tx) => endMembership(tx, { ...input, endDate: shiftDate(input.endDate, 1) })
  )
}

const changeVoiceSchema = z.object({
  groupId: fields.id,
  userId: fields.userId,
  voice: fields.voice,
  date: fields.date
})

/** Changes a singer's Voice from their Section's page; the Voice may move them to another Section. */
export async function changeVoiceAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "change-voice",
    changeVoiceSchema,
    {
      groupId: value(formData, "groupId"),
      userId: value(formData, "userId"),
      voice: value(formData, "voice"),
      date: value(formData, "date")
    },
    async (input, tx) => {
      const choirId = await getChoirIdOf(input.groupId)
      if (!choirId) return { success: false, error: "not-a-singer" }
      return changeVoice(tx, { userId: input.userId, choirId, voice: input.voice, date: input.date })
    }
  )
}
