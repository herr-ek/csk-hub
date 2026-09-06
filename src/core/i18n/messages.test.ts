import { describe, expect, mock, test } from "bun:test"

mock.module("server-only", () => ({}))

const { getMessages } = await import("./messages")

describe("root metadata messages", () => {
  test("provides a localized description for every supported locale", () => {
    expect(getMessages("en").Metadata.description).toBe("The digital hub for Chalmers Sångkör")
    expect(getMessages("sv").Metadata.description).toBe("Chalmers Sångkörs digitala nav")
    expect(getMessages("de").Metadata.description).toBe("Das digitale Zentrum von Chalmers Sångkör")
  })
})
