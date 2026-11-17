import { expect, test } from "bun:test"
import { resolveActivityCursor } from "./stream-cursor"

test("retained cursors use replay without a state reset", () => {
  expect(resolveActivityCursor("100-2", "100-1", "100-10")).toEqual({ cursor: "100-2", reset: false })
  expect(resolveActivityCursor("100-10", "100-1", "100-10")).toEqual({ cursor: "100-10", reset: false })
  expect(resolveActivityCursor("0-0", "0-0", "0-0")).toEqual({ cursor: "0-0", reset: false })
})

test("initial, malformed and future cursors reset from the latest stream position", () => {
  for (const cursor of [null, "bad-cursor", "101-0", "100-11"]) {
    expect(resolveActivityCursor(cursor, "100-1", "100-10")).toEqual({ cursor: "100-10", reset: true })
  }
})

test("trimmed cursors reset state while still replaying available entries", () => {
  expect(resolveActivityCursor("99-5", "100-1", "100-10")).toEqual({ cursor: "99-5", reset: true })
  expect(resolveActivityCursor("200-0", "0-0", "0-0")).toEqual({ cursor: "0-0", reset: true })
})
