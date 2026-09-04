import { beforeEach, describe, expect, mock, test } from "bun:test"

const getSession = mock(async (): Promise<{ user: { id: string; role?: string | null } } | null> => null)
const requestHeaders = mock(async () => new Headers({ cookie: "session=member" }))

mock.module("@/core/auth/auth", () => ({ auth: { api: { getSession } } }))
mock.module("next/headers", () => ({ headers: requestHeaders }))

import { canCurrentMemberPublishPost, PostPublishingDeniedError, requirePostPublisher } from "./permissions.server"

beforeEach(() => {
  getSession.mockClear()
  getSession.mockResolvedValue(null)
})

describe("publishing authorization on the server", () => {
  test("identifies the Admin behind the session as the author", async () => {
    getSession.mockResolvedValue({ user: { id: "admin-1", role: "member,admin" } })

    await expect(requirePostPublisher()).resolves.toEqual({ memberId: "admin-1" })
    await expect(canCurrentMemberPublishPost()).resolves.toBe(true)
  })

  test("refuses a signed-in Member who is not an Admin", async () => {
    getSession.mockResolvedValue({ user: { id: "member-1", role: "member" } })

    await expect(requirePostPublisher()).rejects.toBeInstanceOf(PostPublishingDeniedError)
    await expect(canCurrentMemberPublishPost()).resolves.toBe(false)
  })

  test("refuses a request without a session", async () => {
    await expect(requirePostPublisher()).rejects.toBeInstanceOf(PostPublishingDeniedError)
    await expect(canCurrentMemberPublishPost()).resolves.toBe(false)
  })
})
