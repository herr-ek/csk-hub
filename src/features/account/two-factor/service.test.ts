import { beforeEach, describe, expect, mock, test } from "bun:test"

type Response = { error: null | { message?: string; error?: string }; data?: { redirect: boolean; url: string } }

const sendOtp = mock(async (): Promise<Response> => ({ error: null }))
const verifyTotp = mock(async (): Promise<Response> => ({ error: null }))
const verifyOtp = mock(async (): Promise<Response> => ({ error: null }))
const verifyBackupCode = mock(async (): Promise<Response> => ({ error: null }))

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
  test("preserves provider redirects from every verification method", async () => {
    const response = { data: { redirect: true, url: "https://app.example/callback" }, error: null }
    verifyTotp.mockResolvedValue(response)
    verifyOtp.mockResolvedValue(response)
    verifyBackupCode.mockResolvedValue(response)
    for (const method of ["totp", "otp", "backup"] as const) {
      await expect(verifyTwoFactorMethod(method, "code", false)).resolves.toEqual({ success: true, redirecting: true })
    }
  })
  test("identifies expired OAuth authorization when sending or verifying a code", async () => {
    const response = { error: { error: "invalid_signature" } }
    sendOtp.mockResolvedValue(response)
    verifyOtp.mockResolvedValue(response)

    const expected = { success: false, error: "oauthRequestExpired" } as const
    await expect(sendTwoFactorOtp()).resolves.toEqual(expected)
    await expect(verifyTwoFactorMethod("otp", "123456", false)).resolves.toEqual(expected)
  })

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

  test("distinguishes unavailable requests from rejected verification codes", async () => {
    sendOtp.mockRejectedValue(new Error("Network unavailable"))
    verifyTotp.mockRejectedValue(new Error("Network unavailable"))
    verifyOtp.mockRejectedValue(new Error("Network unavailable"))
    verifyBackupCode.mockRejectedValue(new Error("Network unavailable"))

    await expect(sendTwoFactorOtp()).resolves.toEqual({ success: false, unavailable: true })
    for (const method of ["totp", "otp", "backup"] as const) {
      await expect(verifyTwoFactorMethod(method, "code", false)).resolves.toEqual({ success: false, unavailable: true })
    }
  })

  test("returns auth errors to the caller", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "The code is invalid." } })

    await expect(verifyTwoFactorMethod("otp", "wrong", false)).resolves.toEqual({
      success: false,
      error: "verifyFailed"
    })
  })
})
