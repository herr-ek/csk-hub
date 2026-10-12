"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { changeVoice, endMembership, placeSingerInSection, startMembership } from "../../membership"
import { endPositionHolding, replacePositionHolder } from "../../positions"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"
import { getChoirIdOf } from "./query"

const addMemberSchema = z.object({
  groupId: fields.id,
  userId: fields.userId,
  startDate: fields.date,
  // Present for a Section, where it decides the singer's Voice.
  voice: fields.voice.optional()
})

/** Adds a member; in a Section, places them as a singer with the chosen Voice. */
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
    (input) =>
      input.voice
        ? placeSingerInSection(db, {
            userId: input.userId,
            sectionId: input.groupId,
            voice: input.voice,
            startDate: input.startDate
          })
        : startMembership(db, { userId: input.userId, groupId: input.groupId, startDate: input.startDate })
  )
}

const endMembershipSchema = z.object({ groupId: fields.id, userId: fields.userId, endDate: fields.date })

export async function endMembershipAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "end-membership",
    endMembershipSchema,
    { groupId: value(formData, "groupId"), userId: value(formData, "userId"), endDate: value(formData, "endDate") },
    (input) => endMembership(db, input)
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
    async (input) => {
      const choirId = await getChoirIdOf(input.groupId)
      if (!choirId) return { success: false, error: "not-a-singer" }
      return changeVoice(db, { userId: input.userId, choirId, voice: input.voice, date: input.date })
    }
  )
}

const assignHolderSchema = z.object({
  groupId: fields.id,
  positionId: fields.id,
  userId: fields.userId,
  startDate: fields.date
})

/** Gives a Position to a member, ending any current holder's holding on the same day. */
export async function assignHolderAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "assign-holder",
    assignHolderSchema,
    {
      groupId: value(formData, "groupId"),
      positionId: value(formData, "positionId"),
      userId: value(formData, "userId"),
      startDate: value(formData, "startDate")
    },
    (input) => replacePositionHolder(db, input)
  )
}

const endHoldingSchema = z.object({
  groupId: fields.id,
  positionId: fields.id,
  userId: fields.userId,
  endDate: fields.date
})

export async function endHoldingAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "end-holding",
    endHoldingSchema,
    {
      groupId: value(formData, "groupId"),
      positionId: value(formData, "positionId"),
      userId: value(formData, "userId"),
      endDate: value(formData, "endDate")
    },
    (input) => endPositionHolding(db, input)
  )
}
