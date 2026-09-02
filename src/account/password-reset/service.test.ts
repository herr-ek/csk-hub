import { beforeEach, describe, expect, mock, test } from "bun:test"

const requestPasswordResetEndpoint = mock(async () => ({ error: null as null | { code?: string; status?: number } }))
const resetPasswordEndpoint = mock(async () => ({ error: null as null | { code?: string; status?: number } }))
const signInEmail = mock(async () => ({ data: { user: { role: "member" } }, error: null }))

mock.module("@/core/auth/auth-client", () => ({
  authClient: {
    requestPasswordReset: requestPasswordResetEndpoint,
    resetPassword: resetPasswordEndpoint,
    signIn: { email: signInEmail }
  }
}))

import { ROUTES } from "@/core/navigation/site"
import { requestPasswordReset, resetPassword } from "./service"

beforeEach(() => {
  requestPasswordResetEndpoint.mockReset()
  resetPasswordEndpoint.mockReset()
  signInEmail.mockReset()
  signInEmail.mockResolvedValue({ data: { user: { role: "member" } }, error: null })
})

describe("password reset service", () => {
  test("requests a password reset successfully", async () => {
    requestPasswordResetEndpoint.mockResolvedValue({ error: null })

    await expect(requestPasswordReset("member@example.com")).resolves.toEqual({ success: true })

    expect(requestPasswordResetEndpoint).toHaveBeenCalledWith({
      email: "member@example.com",
      redirectTo: `${ROUTES.resetPassword}?email=member%40example.com`
    })
  })

  test("classifies server errors while requesting a reset as network failures", async () => {
    requestPasswordResetEndpoint.mockResolvedValue({ error: { code: "INTERNAL_ERROR", status: 500 } })

    await expect(requestPasswordReset("member@example.com")).resolves.toEqual({
      success: false,
      kind: "network",
      error: "Unable to send a password reset email right now. Please try again."
    })
  })

  test("normalizes password reset request errors", async () => {
    requestPasswordResetEndpoint.mockResolvedValue({ error: { code: "BAD_REQUEST", status: 400 } })

    await expect(requestPasswordReset("member@example.com")).resolves.toEqual({
      success: false,
      kind: "unknown",
      error: "Unable to send a password reset email right now. Please try again."
    })
  })

  test("classifies invalid reset tokens separately from transient failures", async () => {
    resetPasswordEndpoint.mockResolvedValue({ error: { code: "INVALID_TOKEN", status: 400 } })

    await expect(resetPassword("expired-token", "member@example.com", "correct horse battery staple")).resolves.toEqual(
      {
        success: false,
        kind: "invalid-reset-token",
        error: "That reset link is invalid or has expired."
      }
    )

    resetPasswordEndpoint.mockResolvedValue({ error: { code: "INTERNAL_ERROR", status: 500 } })
    await expect(resetPassword("valid-token", "member@example.com", "correct horse battery staple")).resolves.toEqual({
      success: false,
      kind: "network",
      error: "Unable to reset your password right now. Please try again."
    })
  })

  test("handles expired and unknown reset errors", async () => {
    resetPasswordEndpoint.mockResolvedValue({ error: { code: "TOKEN_EXPIRED", status: 400 } })

    await expect(resetPassword("expired-token", "member@example.com", "correct horse battery staple")).resolves.toEqual(
      {
        success: false,
        kind: "invalid-reset-token",
        error: "That reset link is invalid or has expired."
      }
    )

    resetPasswordEndpoint.mockResolvedValue({ error: { code: "BAD_REQUEST", status: 400 } })
    await expect(resetPassword("unknown-token", "member@example.com", "correct horse battery staple")).resolves.toEqual(
      {
        success: false,
        kind: "unknown",
        error: "Unable to reset your password right now. Please try again."
      }
    )
  })

  test("resets a password successfully", async () => {
    resetPasswordEndpoint.mockResolvedValue({ error: null })

    await expect(resetPassword("valid-token", "member@example.com", "correct horse battery staple")).resolves.toEqual({
      success: true,
      signIn: { success: true, role: "member" }
    })

    expect(resetPasswordEndpoint).toHaveBeenCalledWith({
      newPassword: "correct horse battery staple",
      token: "valid-token"
    })
    expect(signInEmail).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "correct horse battery staple",
      rememberMe: true
    })
  })

  test("normalizes reset password exceptions without exposing details", async () => {
    resetPasswordEndpoint.mockRejectedValue(new Error("database details should not reach the client"))

    await expect(resetPassword("valid-token", "member@example.com", "correct horse battery staple")).resolves.toEqual({
      success: false,
      kind: "network",
      error: "Unable to reset your password right now. Please try again."
    })
  })

  test("normalizes request exceptions without exposing details", async () => {
    requestPasswordResetEndpoint.mockRejectedValue(new Error("SMTP details should not reach the client"))

    await expect(requestPasswordReset("member@example.com")).resolves.toEqual({
      success: false,
      kind: "network",
      error: "Unable to send a password reset email right now. Please try again."
    })
  })
})
