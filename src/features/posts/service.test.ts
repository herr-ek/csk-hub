import { beforeEach, expect, mock, test } from "bun:test"

const requireCurrentUserPermission = mock(async () => ({ state: "authenticated" as const, userId: "reader-1" }))
const select = mock(() => undefined)

mock.module("@/core/auth/permissions.server", () => ({ requireCurrentUserPermission }))
mock.module("@/core/db", () => ({ db: { select } }))

import { getPublishedPost, listNewsFeed } from "./service"

beforeEach(() => {
  requireCurrentUserPermission.mockReset()
  select.mockClear()
})

test.each([
  ["the news feed", () => listNewsFeed()],
  ["a published Post", () => getPublishedPost("11111111-1111-4111-8111-111111111111")],
  ["an invalid Post id", () => getPublishedPost("not-a-uuid")]
])("authorizes before reading %s", async (_name, read) => {
  const denied = new Error("Permission denied")
  requireCurrentUserPermission.mockRejectedValue(denied)

  await expect(read()).rejects.toBe(denied)

  expect(requireCurrentUserPermission).toHaveBeenCalledWith({ resource: "post", action: "read" })
  expect(select).not.toHaveBeenCalled()
})
