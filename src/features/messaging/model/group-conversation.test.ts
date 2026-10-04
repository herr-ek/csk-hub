import { describe, expect, test } from "bun:test"
import { groupMemberIds, MAX_GROUP_NAME_LENGTH, normalizeGroupName } from "./group-conversation"

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
})
