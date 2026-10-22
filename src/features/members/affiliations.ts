import type { EffectiveGroup, EffectivePosition } from "@/core/org-structure"
import { GroupType } from "@/core/org-structure"

export type MemberGroup = EffectiveGroup

export type MemberPosition = EffectivePosition

/** Summaries preserve Group context; matching titles do not imply a shared appointment. */
export function buildAffiliations(memberships: MemberGroup[], holdings: MemberPosition[]) {
  const activeGroups = memberships.filter((membership) => membership.active)
  const positions = holdings.filter((holding) =>
    holding.affiliationGroups.some((context) => activeGroups.some((group) => group.groupId === context.id))
  )
  const groupPositions = (groupId: string) =>
    positions.filter((holding) => holding.affiliationGroups.some((context) => context.id === groupId))
  const withPositions = (group: MemberGroup) => ({ ...group, positions: groupPositions(group.groupId) })
  const choirs = activeGroups
    .filter((group) => group.type === GroupType.Choir)
    .map((choir) => ({
      ...withPositions(choir),
      section:
        activeGroups
          .filter((group) => group.type === GroupType.Section && group.choirId === choir.groupId)
          .map(withPositions)
          .at(0) ?? null,
      groups: activeGroups
        .filter((group) => group.choirId === choir.groupId && group.type !== GroupType.Section)
        .map(withPositions)
    }))
  const groups = activeGroups.filter((group) => !group.choirId && group.type !== GroupType.Choir).map(withPositions)
  // Archiving a Choir does not archive its other Groups. Keep those active Memberships visible.
  const otherGroups = activeGroups
    .filter(
      (group) =>
        group.choirId && group.type !== GroupType.Section && !choirs.some((choir) => choir.groupId === group.choirId)
    )
    .map(withPositions)
  const summary = positions.map((holding) => ({
    id: holding.id,
    positionCode: holding.positionCode,
    name: holding.name,
    contextGroupId: holding.contextGroupId,
    contextName: holding.contextName,
    contextType: holding.contextType,
    contextChoirName: holding.contextChoirName,
    organisationYear: holding.organisationYear,
    startDate: holding.startDate,
    endDate: holding.endDate,
    groups: holding.affiliationGroups
      .filter((context) => activeGroups.some((group) => group.groupId === context.id))
      .map((context) => ({ id: context.id, name: context.name, choirName: context.choirName }))
  }))
  return { choirs, groups, otherGroups, positions: summary }
}

export type ProfileAffiliations = ReturnType<typeof buildAffiliations>
