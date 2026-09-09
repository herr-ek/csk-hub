import { describe, expect, test } from "bun:test"
import { createReadToken, verifiesReadToken } from "./read-token"

describe("Message read tokens", () => {
  test("binds a loaded sequence to its Conversation and Member", () => {
    const token = createReadToken("conversation-1", "member-1", 50)

    expect(verifiesReadToken(token, "conversation-1", "member-1", 50)).toBe(true)
    expect(verifiesReadToken(token, "conversation-1", "member-1", 51)).toBe(false)
    expect(verifiesReadToken(token, "conversation-1", "member-2", 50)).toBe(false)
  })
})
