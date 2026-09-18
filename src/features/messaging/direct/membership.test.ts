import { describe, expect, test } from "bun:test"
import { getDirectCounterpartId } from "./membership"

describe("getDirectCounterpartId", () => {
  const pair = { firstMemberId: "member-a", secondMemberId: "member-b" }

  test("derives the counterpart from direct-pair membership", () => {
    expect(getDirectCounterpartId(pair, "member-a")).toBe("member-b")
    expect(getDirectCounterpartId(pair, "member-b")).toBe("member-a")
  })

  test("does not grant a User outside the direct pair membership", () => {
    expect(getDirectCounterpartId(pair, "outsider")).toBeUndefined()
  })
})
