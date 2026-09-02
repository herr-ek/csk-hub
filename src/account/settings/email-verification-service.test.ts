import { beforeEach, describe, expect, mock, test } from "bun:test"

const sendVerificationOtp = mock(async () => ({ error: null as null | { message?: string } }))
const verifyEmail = mock(async () => ({ error: null as null | { message?: string } }))

mock.module("@/core/auth/auth-client", () => ({
  authClient: { emailOtp: { sendVerificationOtp, verifyEmail } }
}))

import { sendEmailVerificationOtp, verifyEmailOtp } from "./email-verification-service"

beforeEach(() => {
  sendVerificationOtp.mockReset()
  verifyEmail.mockReset()
})

describe("email verification", () => {
  test("sends an email-verification OTP", async () => {
    sendVerificationOtp.mockResolvedValue({ error: null })

    await expect(sendEmailVerificationOtp("member@example.com")).resolves.toEqual({ success: true })
    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "member@example.com", type: "email-verification" })
  })

  test("verifies an email with its OTP", async () => {
    verifyEmail.mockResolvedValue({ error: null })

    await expect(verifyEmailOtp("member@example.com", "123456")).resolves.toEqual({ success: true })
    expect(verifyEmail).toHaveBeenCalledWith({ email: "member@example.com", otp: "123456" })
  })

  test("returns a useful error when sending or verifying fails", async () => {
    sendVerificationOtp.mockResolvedValue({ error: { message: "Too many requests." } })
    verifyEmail.mockResolvedValue({ error: { message: "Invalid code." } })

    await expect(sendEmailVerificationOtp("member@example.com")).resolves.toEqual({
      success: false,
      error: "Too many requests."
    })
    await expect(verifyEmailOtp("member@example.com", "000000")).resolves.toEqual({
      success: false,
      error: "Invalid code."
    })
  })
})
