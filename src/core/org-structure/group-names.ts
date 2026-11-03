import { GroupType } from "./identifiers"

/** The only Group types whose identity includes an explicitly assigned name. */
export const EXPLICIT_GROUP_NAME_TYPES: readonly GroupType[] = [
  GroupType.Choir,
  GroupType.Section,
  GroupType.GigGroup,
  GroupType.Other
]

export function hasExplicitGroupName(type: GroupType) {
  return EXPLICIT_GROUP_NAME_TYPES.includes(type)
}
