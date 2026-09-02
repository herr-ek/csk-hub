import { beforeEach, describe, expect, mock, test } from "bun:test"

const sendOtp = mock(async () => ({ error: null as null | { message: string } }))
const verifyTotp = mock(async () => ({ error: null as null | { message: string } }))
const verifyOtp = mock(async () => ({ error: null as null | { message: string } }))
const verifyBackupCode = mock(async () => ({ error: null as null | { message: string } }))

mock.module("@/core/auth/auth-client", () => ({
  authClient: {
    twoFactor: { sendOtp, verifyTotp, verifyOtp, verifyBackupCode }
  }
}))

import { getAvailableMethods, sendTwoFactorOtp, verifyTwoFactorMethod } from "./service"

beforeEach(() => {
  sendOtp.mockReset()
  verifyTotp.mockReset()
  verifyOtp.mockReset()
  verifyBackupCode.mockReset()
})

describe("two-factor verification", () => {
  test("keeps supported methods and ignores unknown methods", () => {
    expect(getAvailableMethods(["totp", "sms", "otp", "backup"])).toEqual(["totp", "otp"])
  })

  test("sends an email verification code", async () => {
    sendOtp.mockResolvedValue({ error: null })

    await expect(sendTwoFactorOtp()).resolves.toEqual({ success: true })
    expect(sendOtp).toHaveBeenCalledTimes(1)
  })

  test("verifies each supported method through the auth client", async () => {
    verifyTotp.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ error: null })
    verifyBackupCode.mockResolvedValue({ error: null })

    await expect(verifyTwoFactorMethod("totp", "123456", true)).resolves.toEqual({ success: true })
    await expect(verifyTwoFactorMethod("otp", "123456", false)).resolves.toEqual({ success: true })
    await expect(verifyTwoFactorMethod("backup", "recovery-code", true)).resolves.toEqual({ success: true })

    expect(verifyTotp).toHaveBeenCalledWith({ code: "123456", trustDevice: true })
    expect(verifyOtp).toHaveBeenCalledWith({ code: "123456", trustDevice: false })
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: "recovery-code", trustDevice: true, disableSession: false })
  })

  test("returns auth errors to the caller", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "The code is invalid." } })

    await expect(verifyTwoFactorMethod("otp", "wrong", false)).resolves.toEqual({
      success: false,
      error: "The code is invalid."
    })
  })
})
