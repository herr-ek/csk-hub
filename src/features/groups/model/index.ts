import type { groupType } from "@/core/db/schema/groups"

export type { GroupsResult, GroupsViolation } from "./result"
export { type Part, type Voice, voicesOfPart, voiceToPart } from "./voice"

export type GroupType = (typeof groupType.enumValues)[number]

/** A calendar date, `YYYY-MM-DD`, as Memberships and Position holdings are dated. */
export type IsoDate = string
