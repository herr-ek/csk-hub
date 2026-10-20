import "server-only"

import { group, groupMember, position, positionGroup, positionHolder } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, type GroupType, POSITION_DEFINITIONS, type PositionCode } from "./model"
import type { OrgStructureDatabase } from "./operation"

/**
 * Reads legacy evidence only. Candidate codes/years/links require human confirmation before
 * conversion; matching titles, Users or dates never authorise merging independent holdings.
 * Accepts a read-only transaction for a consistent operational inventory. Never writes data.
 */
export async function inventoryOrganisation(database: OrgStructureDatabase) {
  const groups = await database.select().from(group).orderBy(group.id)
  const positions = await database.select().from(position).orderBy(position.id)
  const holdings = await database
    .select()
    .from(positionHolder)
    .orderBy(positionHolder.userId, positionHolder.groupId, positionHolder.positionId, positionHolder.startDate)
  const memberships = await database
    .select()
    .from(groupMember)
    .orderBy(groupMember.userId, groupMember.groupId, groupMember.startDate)
  const restrictions = await database
    .select()
    .from(positionGroup)
    .orderBy(positionGroup.positionId, positionGroup.groupId)
  const groupsById = new Map(groups.map((row) => [row.id, row]))
  function policyOf(groupId: string) {
    const target = groupsById.get(groupId)
    if (!target) throw new Error(`Missing referenced Group ${groupId}`)
    return GROUP_POLICIES[target.type]
  }
  const mappings = positions.map((row) => ({
    positionId: row.id,
    name: row.name,
    candidateCodes: legacyCodes(row.name)
  }))
  const codesById = new Map(mappings.map((row) => [row.positionId, row.candidateCodes]))
  const groupMappings = groups.map((row) => {
    const candidates = nameYears(row.name)
    return {
      groupId: row.id,
      type: row.type,
      explicitYear: row.organisationYear,
      nameYearCandidates: candidates,
      organisationYear: row.organisationYear ?? (candidates.length === 1 ? candidates[0] : null),
      requiresReview: !row.usesAppointmentModel
    }
  })
  const mappingById = new Map(groupMappings.map((row) => [row.groupId, row]))
  const identities = new Map<string, { type: GroupType; organisationYear: number | null; groupIds: string[] }>()
  for (const row of groups) {
    const policy = GROUP_POLICIES[row.type]
    const year = mappingById.get(row.id)?.organisationYear ?? null
    if (
      (policy.cardinality === "singleton" && (policy.lifetime !== "annual" || year !== null)) ||
      (policy.cardinality === "choir-singleton" && row.active)
    ) {
      const key = `${row.type}:${year}:${row.choirId ?? "csk"}`
      const identity = identities.get(key) ?? { type: row.type, organisationYear: year, groupIds: [] }
      identity.groupIds.push(row.id)
      identities.set(key, identity)
    }
  }
  const holdingEvidence = holdings.map((holding) => {
    const context = groupsById.get(holding.groupId)
    const candidates = codesById.get(holding.positionId) ?? []
    const contextCodes = candidates.filter((code) => POSITION_DEFINITIONS[code].context === context?.type)
    return {
      ...holding,
      candidateCodes: candidates,
      contextCodes,
      contextStatus: contextCodes.length === 1 ? "context-evidence" : "requires-context-evidence",
      organisationYear: mappingById.get(holding.groupId)?.organisationYear ?? null,
      restrictions: restrictions.filter((row) => row.positionId === holding.positionId).map((row) => row.groupId)
    }
  })
  const linkedHoldings = holdingEvidence
    .filter((holding) =>
      holding.contextCodes.some((code) =>
        POSITION_DEFINITIONS[code].grants.some((type) => type !== groupsById.get(holding.groupId)?.type)
      )
    )
    .map((holding) => {
      const code = holding.contextCodes[0] as PositionCode
      const expected = POSITION_DEFINITIONS[code].grants.filter(
        (type) => type !== groupsById.get(holding.groupId)?.type
      )
      const possibleCompanions = holdingEvidence.filter((candidate) => {
        if (candidate === holding || candidate.userId !== holding.userId || !candidate.candidateCodes.includes(code))
          return false
        const target = groupsById.get(candidate.groupId)
        return target !== undefined && expected.some((type) => type === target.type)
      })
      const matching = possibleCompanions.filter(
        (candidate) =>
          candidate.startDate === holding.startDate &&
          candidate.endDate === holding.endDate &&
          (policyOf(candidate.groupId).lifetime !== "annual" ||
            (holding.organisationYear !== null && holding.organisationYear === candidate.organisationYear))
      )
      return {
        contextHolding: holding,
        expectedGroupTypes: expected,
        possibleCompanions,
        status: expected.every(
          (type) => matching.filter((candidate) => groupsById.get(candidate.groupId)?.type === type).length === 1
        )
          ? "paired-candidate-requires-review"
          : "partial-or-ambiguous",
        mergeApproved: false as const
      }
    })
  const conflicts: { userId: string; groupId: string; startDate: string; reason: string }[] = []
  for (const member of memberships) {
    if (member.endDate !== null && member.endDate <= member.startDate)
      conflicts.push({ ...member, reason: "empty-or-reversed-period" })
    if (
      memberships.some(
        (other) =>
          other !== member &&
          other.userId === member.userId &&
          other.groupId === member.groupId &&
          overlaps(member, other)
      )
    ) {
      conflicts.push({
        userId: member.userId,
        groupId: member.groupId,
        startDate: member.startDate,
        reason: "overlapping-direct-periods"
      })
    }
  }
  return {
    positionMappings: mappings,
    unsupportedPositions: mappings
      .filter((row) => row.candidateCodes.length === 0)
      .map(({ positionId, name }) => ({ positionId, name })),
    groupMappings,
    ambiguousYears: groupMappings.filter(
      (row) =>
        GROUP_POLICIES[row.type].lifetime === "annual" &&
        (row.explicitYear === null || row.nameYearCandidates.some((year) => year !== row.explicitYear))
    ),
    duplicateSingletons: [...identities.values()].filter((identity) => identity.groupIds.length > 1),
    unclassifiedGroups: groups
      .filter((row) => row.type === "Övrig")
      .map((row) => ({ groupId: row.id, name: row.name })),
    incompatibleScopes: groups
      .filter((row) => row.type !== "Övrig" && (GROUP_POLICIES[row.type].scope === "choir") !== (row.choirId !== null))
      .map((row) => ({ groupId: row.id, type: row.type, choirId: row.choirId })),
    holdingEvidence,
    linkedHoldings,
    conflictingMemberships: conflicts,
    directMemberIntent: memberships
      .filter((member) => {
        const type = groupsById.get(member.groupId)?.type
        return type !== "Choir" && type !== "Section"
      })
      .map((member) => ({
        ...member,
        reason:
          policyOf(member.groupId).directMembership === "no"
            ? "appointment-only-group"
            : holdings.some(
                  (holding) =>
                    holding.userId === member.userId && holding.groupId === member.groupId && overlaps(member, holding)
                )
              ? "possible-grant-copy"
              : "helper-intent-unconfirmed"
      }))
  }
}

function legacyCodes(name: string): PositionCode[] {
  if (name === "Gigmästare") return ["csk-gigmastare"]
  if (/^Gigmästare (MK|DK|KK)$/.test(name)) return ["choir-gigmastare"]
  if (name === "Konsertmästare") return ["choir-konsertmastare"]
  return (Object.entries(POSITION_DEFINITIONS) as [PositionCode, { label: string }][])
    .filter(([, definition]) => definition.label === name)
    .map(([code]) => code)
}

function nameYears(name: string): number[] {
  const years = new Set<number>()
  for (const match of name.matchAll(/\b(\d{4}|\d{2})\s*\/\s*(\d{4}|\d{2})\b/g)) {
    const start = Number(match[1])
    const end = Number(match[2])
    if ((start + 1) % 100 !== end % 100 || (match[1]?.length === 4 && match[2]?.length === 4 && end !== start + 1))
      continue
    // Short names carry a reviewable 2000-century candidate, never a canonical identity.
    years.add(start < 100 ? 2000 + start : start)
  }
  return [...years].sort()
}

function overlaps(a: { startDate: string; endDate: string | null }, b: { startDate: string; endDate: string | null }) {
  return (a.endDate === null || b.startDate < a.endDate) && (b.endDate === null || a.startDate < b.endDate)
}
