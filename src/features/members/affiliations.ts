import type { GroupType } from "@/features/org-structure/model"
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

export type MemberPosition = { groupId: string; positionId: string; name: string }

/** Summaries preserve Group context; matching titles do not imply a shared appointment. */
export function buildAffiliations(memberships: MemberGroup[], holdings: MemberPosition[]) {
  const activeGroups = memberships.filter((membership) => membership.active)
  const positions = holdings.filter((holding) => activeGroups.some((group) => group.groupId === holding.groupId))
  const groupPositions = (groupId: string) => positions.filter((holding) => holding.groupId === groupId)
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
  const summary = [
    ...new Map(
      positions.map((position) => [position.positionId, { id: position.positionId, name: position.name }])
    ).values()
  ].map((position) => ({
    ...position,
    groups: positions
      .filter((holding) => holding.positionId === position.id)
      .flatMap((holding) => {
        const group = activeGroups.find((group) => group.groupId === holding.groupId)
        return group ? [{ id: group.groupId, name: group.name, choirName: group.choirName }] : []
      })
  }))
  return { choirs, groups, otherGroups, positions: summary }
}

export type ProfileAffiliations = ReturnType<typeof buildAffiliations>
