import { expect, test } from "bun:test"
import type { ActivityEvent } from "./events"
import { canPresentActivity } from "./presentation"

test("deferred notifications expire at the server's push deadline", () => {
  const event: ActivityEvent = { id: "delivery", kind: "message.created", notify: true, notifyUntil: 8_000 }
  expect(canPresentActivity(event, 1_000)).toBe(true)
  expect(canPresentActivity(event, 8_000)).toBe(false)
  expect(canPresentActivity(event, 12_000)).toBe(false)
})

test("content changes and notifications without a deadline never produce a toast", () => {
  expect(canPresentActivity({ id: "delivery", kind: "posts.changed", notify: false, notifyUntil: 8_000 }, 1_000)).toBe(
    false
  )
  expect(canPresentActivity({ id: "delivery", kind: "message.created", notify: true }, 1_000)).toBe(false)
})
