import { beforeEach, describe, expect, mock, test } from "bun:test"

const createUser = mock(async () => undefined)
const signInMagicLink = mock(async () => undefined)
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const requestHeaders = mock(async () => new Headers({ cookie: "session=admin" }))
const revalidatePath = mock(() => undefined)
const loggerError = mock(() => undefined)
const loggerWarn = mock(() => undefined)

mock.module("@/core/auth/auth", () => ({ auth: { api: { createUser, signInMagicLink } } }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("@/core/logging", () => ({ logger: { error: loggerError, warn: loggerWarn } }))
mock.module("next/headers", () => ({ headers: requestHeaders }))
mock.module("next/cache", () => ({ revalidatePath }))

import { addMember } from "./actions"

function memberFormData() {
  const formData = new FormData()
  formData.set("name", "Ada Lovelace")
  formData.set("email", "ada@example.com")
  return formData
}

beforeEach(() => {
  createUser.mockReset()
  createUser.mockResolvedValue(undefined)
  signInMagicLink.mockReset()
  signInMagicLink.mockResolvedValue(undefined)
  requireAdmin.mockClear()
  requestHeaders.mockClear()
  revalidatePath.mockClear()
  loggerError.mockClear()
  loggerWarn.mockClear()
})

describe("add member", () => {
  test("reports a created member when invite delivery fails", async () => {
    signInMagicLink.mockRejectedValue(new Error("smtp unavailable"))

    await expect(addMember({ status: "idle" }, memberFormData())).resolves.toMatchObject({
      status: "email-failed",
      name: "Ada Lovelace",
      email: "ada@example.com"
    })

    expect(createUser).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  test("does not claim that a member was created when creation fails", async () => {
    createUser.mockRejectedValue({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })

    await expect(addMember({ status: "idle" }, memberFormData())).resolves.toEqual({
      status: "error",
      error: "A member with that email already exists."
    })

    expect(signInMagicLink).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
