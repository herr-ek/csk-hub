"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { createPosition, updatePosition } from "../../structure"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

const groupTypes = z.array(fields.groupType)

const createPositionSchema = z.object({ name: fields.name, groupTypes })

export async function createPositionAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "create-position",
    createPositionSchema,
    { name: value(formData, "name"), groupTypes: formData.getAll("groupTypes") },
    (input) => createPosition(db, input)
  )
}

const updatePositionSchema = z.object({ positionId: fields.id, name: fields.name, groupTypes })

/** Renames a Position and replaces the GroupTypes it may be held in, as one edit. */
export async function updatePositionAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "update-position",
    updatePositionSchema,
    {
      positionId: value(formData, "positionId"),
      name: value(formData, "name"),
      groupTypes: formData.getAll("groupTypes")
    },
    (input) => updatePosition(db, input)
  )
}
