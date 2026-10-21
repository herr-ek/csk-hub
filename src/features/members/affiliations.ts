import type { GroupType, PositionCode } from "@/features/org-structure/model"
import type { Voice, VoiceDivision } from "@/features/voice/model"

export type MemberGroup = {
  groupId: string
  name: string
  type: GroupType
  choirId: string | null
  choirName: string | null
  active: boolean
  startDate: string
  voice: VoiceDivision | null
  sectionVoice: Voice | null
}

export type MemberPosition = {
  id: string
  positionCode: PositionCode | null
  name: string
  contextGroupId: string
  contextName: string
  contextType: GroupType
  contextChoirName: string | null
  organisationYear: number | null
  startDate: string
  endDate: string | null
  groupIds: string[]
}

/** Summaries preserve Group context; matching titles do not imply a shared appointment. */
export function buildAffiliations(memberships: MemberGroup[], holdings: MemberPosition[]) {
  const activeGroups = memberships.filter((membership) => membership.active)
  const positions = holdings
  const groupPositions = (groupId: string) => positions.filter((holding) => holding.groupIds.includes(groupId))
  const withPositions = (group: MemberGroup) => ({ ...group, positions: groupPositions(group.groupId) })
  const choirs = activeGroups
    .filter((group) => group.type === "Choir")
    .map((choir) => ({
      ...withPositions(choir),
      section:
        activeGroups
          .filter((group) => group.type === "Section" && group.choirId === choir.groupId)
          .map(withPositions)[0] ?? null,
      groups: activeGroups
        .filter((group) => group.choirId === choir.groupId && group.type !== "Section")
        .map(withPositions)
    }))
  const groups = activeGroups.filter((group) => !group.choirId && group.type !== "Choir").map(withPositions)
  // Archiving a Choir does not archive its other Groups. Keep those active Memberships visible.
  const otherGroups = activeGroups
    .filter(
      (group) => group.choirId && group.type !== "Section" && !choirs.some((choir) => choir.groupId === group.choirId)
    )
    .map(withPositions)
  const summary = positions.map((holding) => ({
    id: holding.id,
    positionCode: holding.positionCode,
    name: holding.name,
    contextName: holding.contextName,
    contextType: holding.contextType,
    contextChoirName: holding.contextChoirName,
    organisationYear: holding.organisationYear,
    startDate: holding.startDate,
    endDate: holding.endDate,
    groups: holding.groupIds.flatMap((groupId) => {
      const group = activeGroups.find((candidate) => candidate.groupId === groupId)
      return group ? [{ id: group.groupId, name: group.name, choirName: group.choirName }] : []
    })
  }))
  return { choirs, groups, otherGroups, positions: summary }
}

export type ProfileAffiliations = ReturnType<typeof buildAffiliations>
