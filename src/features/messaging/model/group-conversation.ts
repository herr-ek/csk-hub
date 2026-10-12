import { MessagingAccessError } from "./messaging-error"

export const MAX_GROUP_NAME_LENGTH = 100
export const MAX_GROUP_MEMBER_IDS_PER_REQUEST = 100

export function normalizeGroupName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_GROUP_NAME_LENGTH)
    throw new MessagingAccessError("group-name-invalid")
  return value.trim()
}

export function groupMemberIds(values: readonly string[], creatorId?: string) {
  // Bound submitted work, including duplicates and blanks, before normalization or database locks.
  if (values.length > MAX_GROUP_MEMBER_IDS_PER_REQUEST) throw new MessagingAccessError("group-members-too-many")
  const ids = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (creatorId) {
    const others = ids.filter((id) => id !== creatorId)
    if (!others.length) throw new MessagingAccessError("recipient-required")
    return [creatorId, ...others].sort()
  }
  if (!ids.length) throw new MessagingAccessError("recipient-required")
  return ids.sort()
}
