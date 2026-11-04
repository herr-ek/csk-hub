import type { voice } from "@/core/db/schema/voice"
import { GroupType } from "./identifiers"

/** The only Group types whose identity includes an explicitly assigned name. */
export const EXPLICIT_GROUP_NAME_TYPES: readonly GroupType[] = [GroupType.Choir, GroupType.GigGroup, GroupType.Other]

export function hasExplicitGroupName(type: GroupType) {
  return EXPLICIT_GROUP_NAME_TYPES.includes(type)
}

/** A Section is named by its owning Choir and Section Voice, never a singer's division. */
export function sectionName(
  choirName: string | null | undefined,
  sectionVoice: (typeof voice.enumValues)[number] | null | undefined
) {
  if (!choirName || !sectionVoice) throw new Error("A Section name requires its owning Choir and Section Voice.")
  return `${choirName}${sectionVoice}`
}
