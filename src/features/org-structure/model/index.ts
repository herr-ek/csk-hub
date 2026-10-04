import type { groupType } from "@/core/db/schema/org-structure"

export type { OrgStructureResult, OrgStructureViolation } from "./result"

export type GroupType = (typeof groupType.enumValues)[number]

/** A calendar date, `YYYY-MM-DD`, as Memberships and Position holdings are dated. */
export type IsoDate = string
