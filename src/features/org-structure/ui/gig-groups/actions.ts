"use server"

import { z } from "zod"
import { GroupType } from "@/core/org-structure"
import { createOrganisationGroup } from "../../appointments"
import { refillGigGroup } from "../../year-commands"
import type { GroupCommandState } from "../command-state"
import { fields, value, values } from "../fields"
import { runGroupCommand } from "../run-command"

/** Creates a CSK-wide fluid ensemble; type, scope, and year are fixed by this workflow. */
export async function createGigGroupAction(_state: GroupCommandState, formData: FormData) {
  return runGroupCommand(
    "create-gig-group",
    z.object({ name: fields.name }),
    { name: value(formData, "name") },
    (input, tx) => createOrganisationGroup(tx, { name: input.name, type: GroupType.GigGroup })
  )
}

const refillSchema = z.object({
  groupId: fields.id,
  date: fields.date,
  leave: z.array(fields.id),
  voices: z.array(z.object({ membershipId: fields.id, voice: fields.voice })),
  join: z.array(z.object({ userId: fields.userId, voice: fields.voice }))
})

/** Applies one editing session of a line-up. Voices arrive as `VOICE:id`, since an id may hold anything. */
export async function refillGigGroupAction(_state: GroupCommandState, formData: FormData) {
  const pair = (raw: string): [string, string] => {
    const separator = raw.indexOf(":")
    return [raw.slice(0, separator), raw.slice(separator + 1)]
  }
  return runGroupCommand(
    "refill-gig-group",
    refillSchema,
    {
      groupId: value(formData, "groupId"),
      date: value(formData, "date"),
      leave: values(formData, "leave"),
      voices: values(formData, "voices").map((raw) => {
        const [voice, membershipId] = pair(raw)
        return { voice, membershipId }
      }),
      join: values(formData, "join").map((raw) => {
        const [voice, userId] = pair(raw)
        return { voice, userId }
      })
    },
    (input, tx) => refillGigGroup(tx, input)
  )
}
