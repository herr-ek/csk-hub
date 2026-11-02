import { describe, expect, test } from "bun:test"
import { slotIndexAt } from "./quick-access"

describe("quick access", () => {
  test("finds the slot under a dragging finger, clamped to the row", () => {
    expect(slotIndexAt(10, 200, 4)).toBe(0)
    expect(slotIndexAt(120, 200, 4)).toBe(2)
    expect(slotIndexAt(199, 200, 4)).toBe(3)
    expect(slotIndexAt(-30, 200, 4)).toBe(0)
    expect(slotIndexAt(260, 200, 4)).toBe(3)
  })
})
