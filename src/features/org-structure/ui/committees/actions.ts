"use server"

import { z } from "zod"
import { GroupType, shiftDate } from "@/core/org-structure"
import { createOrganisationGroup } from "../../appointments"
import { removeDirectMembership } from "../../direct-membership"
import { cskToday } from "../../effective-reads"
import { archiveGroup, renameGroup } from "../../structure"
import { addGroupMembers } from "../../year-commands"
import type { GroupCommandState } from "../command-state"
import { fields, value, values } from "../fields"
import { runGroupCommand } from "../run-command"

const addSchema = z
  .object({
    groupId: fields.id.optional(),
    type: fields.groupType.optional(),
    organisationYear: fields.organisationYear.optional(),
    userIds: z.array(fields.userId).min(1),
    voiceFamily: fields.voiceFamily.optional(),
    startDate: fields.date,
    lastDay: fields.date.optional()
  })
  .transform(({ groupId, type, organisationYear, ...input }, context) => {
    if (type !== undefined && organisationYear !== undefined) return { ...input, target: { type, organisationYear } }
    if (groupId !== undefined) return { ...input, target: { groupId } }
    context.addIssue({ code: "custom", message: "missing-target" })
    return z.NEVER
  })

/** Adds everyone picked to a committee or Other Group, setting up the committee's year when needed. */
export async function addMembersAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "add-members",
    addSchema,
    {
      groupId: value(formData, "groupId"),
      type: value(formData, "type"),
      organisationYear: value(formData, "organisationYear"),
      userIds: values(formData, "userIds"),
      voiceFamily: value(formData, "voiceFamily"),
      startDate: value(formData, "startDate"),
      lastDay: value(formData, "lastDay")
    },
    ({ userIds, voiceFamily, lastDay, ...input }, tx) =>
      addGroupMembers(tx, {
        ...input,
        members: userIds.map((userId) => ({ userId, voiceFamily })),
        endDate: lastDay ? shiftDate(lastDay, 1) : undefined
      })
  )
}

const removeSchema = z.object({ membershipId: fields.id, lastDay: fields.date.optional() })

/** Ends someone's participation on its last day; without one, they had not begun before today. */
export async function removeMemberAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "remove-member",
    removeSchema,
    { membershipId: value(formData, "membershipId"), lastDay: value(formData, "lastDay") },
    ({ membershipId, lastDay }, tx) =>
      removeDirectMembership(tx, { membershipId, date: lastDay ? shiftDate(lastDay, 1) : cskToday() })
  )
}

/** Creates a CSK-wide Group outside the fixed committees; its type and scope are fixed by this workflow. */
export async function createOtherGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "create-other-group",
    z.object({ name: fields.name }),
    { name: value(formData, "name") },
    ({ name }, tx) => createOrganisationGroup(tx, { name, type: GroupType.Other })
  )
}

export async function renameGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "rename",
    z.object({ groupId: fields.id, name: fields.name }),
    { groupId: value(formData, "groupId"), name: value(formData, "name") },
    ({ groupId, name }, tx) => renameGroup(tx, groupId, name)
  )
}

export async function archiveGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "archive",
    z.object({ groupId: fields.id }),
    { groupId: value(formData, "groupId") },
    ({ groupId }, tx) => archiveGroup(tx, groupId)
  )
}
