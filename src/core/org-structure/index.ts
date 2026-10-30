import { GroupType } from "./identifiers"

export {
  annualAppointmentDefaults,
  currentOrganisationYear,
  isAllowedOrganisationYear,
  periodsCoverPeriod,
  shiftDate
} from "./dates"
export type { EffectiveGroup, EffectivePosition } from "./effective"
export { GroupType, PositionCode } from "./identifiers"
export type { OrgStructureResult, OrgStructureViolation } from "./result"

/**
 * The group types whose Positions are elected posts, as each Board member is elected to one post:
 * a member holds at most one current Position in such a group. Elsewhere, as in a Choir's
 * responsibility groups, a member may hold several.
 */
const ELECTED_POST_GROUP_TYPES: readonly GroupType[] = [GroupType.Board]

export function holdsElectedPosts(type: GroupType) {
  return ELECTED_POST_GROUP_TYPES.includes(type)
}

/** A calendar date, `YYYY-MM-DD`, as Memberships and Position holdings are dated. */
export type IsoDate = string

export { GROUP_POLICIES, organisationYearPeriod, POSITION_DEFINITIONS } from "./catalogue"
export { EXPLICIT_GROUP_NAME_TYPES, hasExplicitGroupName } from "./group-names"
export { formatGroupLabel, groupTypeKey, positionCodeKey } from "./labels"
