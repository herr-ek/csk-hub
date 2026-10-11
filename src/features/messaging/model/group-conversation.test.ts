import { describe, expect, test } from "bun:test"
import {
  groupMemberIds,
  MAX_GROUP_MEMBER_IDS_PER_REQUEST,
  MAX_GROUP_NAME_LENGTH,
  normalizeGroupName
} from "./group-conversation"

describe("Group Conversation creation", () => {
  test("requires a nonblank name and normalizes whitespace", () => {
    expect(normalizeGroupName("  Rehearsal planning  ")).toBe("Rehearsal planning")
    for (const name of ["  ", null, "a".repeat(MAX_GROUP_NAME_LENGTH + 1)])
      expect(() => normalizeGroupName(name)).toThrow("group-name-invalid")
  })
  test("requires another member and includes the creator exactly once", () => {
    expect(groupMemberIds(["b", "b", "a"], "a")).toEqual(["a", "b"])
    expect(() => groupMemberIds(["a", " "], "a")).toThrow("recipient-required")
    expect(() => groupMemberIds([], "a")).toThrow("recipient-required")
  })
  test("accepts the request limit and rejects larger submissions before deduplication", () => {
    const ids = Array.from({ length: MAX_GROUP_MEMBER_IDS_PER_REQUEST }, (_, index) => `member-${index}`)
    expect(groupMemberIds(ids)).toHaveLength(MAX_GROUP_MEMBER_IDS_PER_REQUEST)
    expect(groupMemberIds(ids, "creator")).toHaveLength(MAX_GROUP_MEMBER_IDS_PER_REQUEST + 1)
    for (const values of [[...ids, "extra"], Array(MAX_GROUP_MEMBER_IDS_PER_REQUEST + 1).fill("member")]) {
      expect(() => groupMemberIds(values)).toThrow("group-members-too-many")
      expect(() => groupMemberIds(values, "creator")).toThrow("group-members-too-many")
    }
  })
})
