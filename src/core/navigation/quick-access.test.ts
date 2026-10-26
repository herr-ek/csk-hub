import { describe, expect, test } from "bun:test"
import { moveShortcut, slotIndexAt, toggleShortcut, visibleQuickAccess } from "./quick-access"

describe("quick access", () => {
  test("hides admin shortcuts from members who are not admins", () => {
    expect(visibleQuickAccess(["news", "adminUsers", "messages"], { isAdmin: false })).toEqual(["news", "messages"])
    expect(visibleQuickAccess(["news", "adminUsers"], { isAdmin: true })).toEqual(["news", "adminUsers"])
  })

  test("adds a shortcut at the end and removes it again", () => {
    expect(toggleShortcut(["news"], "messages")).toEqual(["news", "messages"])
    expect(toggleShortcut(["news", "messages"], "news")).toEqual(["messages"])
  })

  test("does not add past the limit", () => {
    const full = ["news", "newsCompose", "messages", "account"] as const
    expect(toggleShortcut(full, "accountSettings")).toEqual([...full])
    expect(toggleShortcut(full, "account")).toEqual(["news", "newsCompose", "messages"])
  })

  test("moves a shortcut and stops at either end", () => {
    expect(moveShortcut(["news", "messages", "account"], "account", -1)).toEqual(["news", "account", "messages"])
    expect(moveShortcut(["news", "messages"], "news", -1)).toEqual(["news", "messages"])
    expect(moveShortcut(["news", "messages"], "messages", 1)).toEqual(["news", "messages"])
  })

  test("finds the slot under a dragging finger, clamped to the row", () => {
    expect(slotIndexAt(10, 200, 4)).toBe(0)
    expect(slotIndexAt(120, 200, 4)).toBe(2)
    expect(slotIndexAt(199, 200, 4)).toBe(3)
    expect(slotIndexAt(-30, 200, 4)).toBe(0)
    expect(slotIndexAt(260, 200, 4)).toBe(3)
  })
})
