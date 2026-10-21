"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { createOrganisationGroup } from "../../appointments"
import { prepareOrganisationYear, updateOrganisationGroup } from "../../group-management"
import { archiveGroup, renameGroup } from "../../structure"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const createGroupSchema = z.object({
  name: fields.name,
  type: fields.creatableGroupType,
  choirId: fields.id.optional(),
  organisationYear: z.coerce.number().int().min(1000).max(9998).optional()
})

export async function createGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "create",
    createGroupSchema,
    {
      name: value(formData, "name"),
      type: value(formData, "type"),
      choirId: value(formData, "choirId"),
      organisationYear: value(formData, "organisationYear")
    },
    (input) => createOrganisationGroup(db, input)
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

const prepareYearSchema = z.object({ organisationYear: z.coerce.number().int().min(1000).max(9998) })

export async function prepareYearAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "prepare-year",
    prepareYearSchema,
    { organisationYear: value(formData, "organisationYear") },
    (input) => prepareOrganisationYear(db, input.organisationYear)
  )
}

const editGroupSchema = createGroupSchema.extend({ groupId: fields.id })

export async function editGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "edit-group",
    editGroupSchema,
    {
      groupId: value(formData, "groupId"),
      name: value(formData, "name"),
      type: value(formData, "type"),
      choirId: value(formData, "choirId"),
      organisationYear: value(formData, "organisationYear")
    },
    (input) => updateOrganisationGroup(db, input)
  )
}
