"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { GroupType } from "@/core/org-structure"
import { createOrganisationGroup } from "../../appointments"
import type { GroupCommandState } from "../command-state"
import { fields, value } from "../fields"
import { runGroupCommand } from "../run-command"

/** Creates a CSK-wide fluid ensemble; type, scope, and year are fixed by this workflow. */
export async function createGigGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "create-gig-group",
    z.object({ name: fields.name }),
    { name: value(formData, "name") },
    (input) => createOrganisationGroup(db, { name: input.name, type: GroupType.GigGroup })
  )
}
