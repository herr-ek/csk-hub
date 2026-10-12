"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { archiveGroup, createGroup, renameGroup } from "../../structure"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const createGroupSchema = z.object({
  name: fields.name,
  type: fields.creatableGroupType,
  choirId: fields.id.optional()
})

export async function createGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "create",
    createGroupSchema,
    { name: value(formData, "name"), type: value(formData, "type"), choirId: value(formData, "choirId") },
    (input) => createGroup(db, { name: input.name, type: input.type, choirId: input.choirId ?? null })
  )
}

const renameGroupSchema = z.object({ groupId: fields.id, name: fields.name })

export async function renameGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "rename",
    renameGroupSchema,
    { groupId: value(formData, "groupId"), name: value(formData, "name") },
    (input) => renameGroup(db, input.groupId, input.name)
  )
}

const archiveGroupSchema = z.object({ groupId: fields.id })

export async function archiveGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand("archive", archiveGroupSchema, { groupId: value(formData, "groupId") }, (input) =>
    archiveGroup(db, input.groupId)
  )
}
