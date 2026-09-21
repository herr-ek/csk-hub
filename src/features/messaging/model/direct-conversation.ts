/** The single active-recipient rule used by direct-message reads and writes. */
export function canReceiveDirectMessages({ exists, banned }: { exists: boolean; banned: boolean }) {
  return exists && !banned
}

/** Returns the other member when the User belongs to a Direct Conversation. */
export function getDirectCounterpartId(pair: { firstMemberId: string; secondMemberId: string }, userId: string) {
  if (pair.firstMemberId === userId) return pair.secondMemberId
  if (pair.secondMemberId === userId) return pair.firstMemberId
  return undefined
}
