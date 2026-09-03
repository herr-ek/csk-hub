import { beforeEach, describe, expect, mock, test } from "bun:test"

const setPassword = mock(async () => undefined)
const requestHeaders = mock(async () => new Headers({ cookie: "activation=valid" }))

mock.module("@/core/auth/auth", () => ({
  auth: { api: { setPassword } }
}))
mock.module("next/headers", () => ({ headers: requestHeaders }))

import { activateAccount } from "./actions"

function formData(password: string, confirmPassword = password) {
  const data = new FormData()
  data.set("password", password)
  data.set("confirmPassword", confirmPassword)
  return data
}

beforeEach(() => {
  setPassword.mockReset()
  requestHeaders.mockReset()
  requestHeaders.mockResolvedValue(new Headers({ cookie: "activation=valid" }))
})

describe("account activation", () => {
  test("rejects passwords that do not satisfy the password policy", async () => {
    await expect(activateAccount({ status: "idle" }, formData("short"))).resolves.toEqual({
      status: "error",
      kind: "validation",
      error: "Use a password with at least 8 characters."
    })
    expect(setPassword).not.toHaveBeenCalled()
  })

  test("rejects passwords that do not match", async () => {
    await expect(
      activateAccount({ status: "idle" }, formData("correct horse battery staple", "another valid password"))
    ).resolves.toEqual({
      status: "error",
      kind: "validation",
      error: "Passwords do not match."
    })
    expect(setPassword).not.toHaveBeenCalled()
  })

  test("sets the password for a valid activation", async () => {
    await expect(activateAccount({ status: "idle" }, formData("correct horse battery staple"))).resolves.toEqual({
      status: "success",
      redirectTo: "/"
    })
    expect(requestHeaders).toHaveBeenCalledTimes(1)
    expect(setPassword).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { newPassword: "correct horse battery staple" }
    })
  })

  test("returns an expired-link error for invalid activation sessions", async () => {
    setPassword.mockRejectedValue({ code: "SESSION_EXPIRED", status: 401 })

    await expect(activateAccount({ status: "idle" }, formData("correct horse battery staple"))).resolves.toEqual({
      status: "error",
      kind: "invalid-link",
      error: "This activation link is invalid or has expired."
    })
  })

  test("hides unexpected activation failures", async () => {
    setPassword.mockRejectedValue(new Error("database details should not reach the client"))

    await expect(activateAccount({ status: "idle" }, formData("correct horse battery staple"))).resolves.toEqual({
      status: "error",
      kind: "unknown",
      error: "Unable to activate your account right now. Please try again."
    })
  })
})
