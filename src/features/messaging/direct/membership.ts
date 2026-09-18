/** Returns the other member when the User belongs to a direct pair. */
export function getDirectCounterpartId(pair: { firstMemberId: string; secondMemberId: string }, userId: string) {
  if (pair.firstMemberId === userId) return pair.secondMemberId
  if (pair.secondMemberId === userId) return pair.firstMemberId
  return undefined
}
