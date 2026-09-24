import { describe, expect, test } from "bun:test"
import { nextMessageIdempotencyKey } from "./idempotency-key"

describe("Message idempotency keys", () => {
  test("replaces the completed send's key before the next Message", () => {
    const keys = ["second-key"]

    expect(nextMessageIdempotencyKey("first-key", () => keys.shift() ?? "")).toBe("second-key")
  })
})
