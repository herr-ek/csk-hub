import type { AuthorizationActor, PostAudienceTarget, PostRelationships } from "./model"

/** Current Section assignments, scoped like Event targets; self-reported capabilities play no part. */
export function matchesPostTarget(
  actor: AuthorizationActor,
  target: PostAudienceTarget,
  relationships: PostRelationships
): boolean {
  const current = relationships.memberships.filter((m) => m.userId === actor.userId && m.endDate === null)
  if (target.groupId === null && target.voiceFamily === null) return false
  if (target.groupId !== null && !current.some((m) => m.groupId === target.groupId)) return false
  if (target.voiceFamily === null) return true
  const scope = relationships.groups.find((g) => g.id === target.groupId)
  return current.some((membership) => {
    const group = relationships.groups.find((g) => g.id === membership.groupId)
    return (
      group?.type === "Section" &&
      membership.voice?.slice(0, 1) === target.voiceFamily &&
      (scope?.type === "Choir" ? group.choirId === scope.id : scope?.type === "Section" ? group.id === scope.id : true)
    )
  })
}

/** Order-independent target equality for audience authorization and meaningful edit attribution. */
export function samePostTargets(left: readonly PostAudienceTarget[], right: readonly PostAudienceTarget[]): boolean {
  const key = (target: PostAudienceTarget) => JSON.stringify([target.groupId, target.voiceFamily])
  const keys = new Set(left.map(key))
  return (
    left.length === right.length &&
    keys.size === left.length &&
    new Set(right.map(key)).size === right.length &&
    right.every((target) => keys.has(key(target)))
  )
}
