import type { groupType } from "@/core/db/schema/org-structure"

export type { OrgStructureResult, OrgStructureViolation } from "./result"

export type GroupType = (typeof groupType.enumValues)[number]

/**
 * The group types whose Positions are elected posts, as each Board member is elected to one post:
 * a member holds at most one current Position in such a group. Elsewhere, as in a Choir's
 * responsibility groups, a member may hold several.
 */
const ELECTED_POST_GROUP_TYPES: readonly GroupType[] = ["Board"]

export function holdsElectedPosts(type: GroupType) {
  return ELECTED_POST_GROUP_TYPES.includes(type)
}

/** A calendar date, `YYYY-MM-DD`, as Memberships and Position holdings are dated. */
export type IsoDate = string
