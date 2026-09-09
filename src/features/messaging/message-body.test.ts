import { describe, expect, test } from "bun:test"
import { validateMessageBody } from "./message-body"

describe("Message body validation", () => {
  test("trims outer whitespace while preserving intentional line breaks", () => {
    expect(validateMessageBody("  Hello\nthere  ")).toEqual({ success: true, data: "Hello\nthere" })
  })

  test("rejects blank and oversized bodies", () => {
    expect(validateMessageBody(" \n ")).toEqual({ success: false, error: "Enter a message." })
    expect(validateMessageBody("a".repeat(4001))).toEqual({
      success: false,
      error: "Messages can be at most 4,000 characters."
    })
  })
})
