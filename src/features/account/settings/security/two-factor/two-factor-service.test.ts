import { beforeEach, describe, expect, mock, test } from "bun:test"

const enable = mock(async () => ({
  data: { totpURI: "otpauth://totp/CSK", backupCodes: ["backup-1"] },
  error: null as null | { message: string }
}))
const disable = mock(async () => ({ error: null as null | { message: string } }))
const verifyTotp = mock(async () => ({ error: null as null | { message: string } }))

mock.module("@/core/auth/auth-client", () => ({
  authClient: { twoFactor: { enable, disable, verifyTotp } }
}))

import { disableTwoFactor, enableTwoFactor, verifyTwoFactorSetup } from "./two-factor-service"

beforeEach(() => {
  enable.mockReset()
  disable.mockReset()
  verifyTotp.mockReset()
})

describe("two-factor settings", () => {
  test("starts setup and returns the authenticator data", async () => {
    enable.mockResolvedValue({
      data: { totpURI: "otpauth://totp/CSK", backupCodes: ["backup-1"] },
      error: null
    })

    await expect(enableTwoFactor("correct horse battery staple")).resolves.toEqual({
      success: true,
      totpUri: "otpauth://totp/CSK",
      backupCodes: ["backup-1"]
    })
    expect(enable).toHaveBeenCalledWith({ password: "correct horse battery staple" })
  })

  test("disables two-factor authentication", async () => {
    disable.mockResolvedValue({ error: null })

    await expect(disableTwoFactor("correct horse battery staple")).resolves.toEqual({ success: true })
    expect(disable).toHaveBeenCalledWith({ password: "correct horse battery staple" })
  })

  test("verifies the authenticator setup code", async () => {
    verifyTotp.mockResolvedValue({ error: null })

    await expect(verifyTwoFactorSetup("123456")).resolves.toEqual({ success: true })
    expect(verifyTotp).toHaveBeenCalledWith({ code: "123456" })
  })

  test("returns auth errors for setup operations", async () => {
    enable.mockResolvedValue({
      data: { totpURI: "otpauth://totp/CSK", backupCodes: ["backup-1"] },
      error: { message: "Password is incorrect." }
    })
    disable.mockResolvedValue({ error: { message: "Password is incorrect." } })
    verifyTotp.mockResolvedValue({ error: { message: "The code is invalid." } })

    await expect(enableTwoFactor("wrong")).resolves.toEqual({ success: false, error: "Password is incorrect." })
    await expect(disableTwoFactor("wrong")).resolves.toEqual({ success: false, error: "Password is incorrect." })
    await expect(verifyTwoFactorSetup("wrong")).resolves.toEqual({ success: false, error: "The code is invalid." })
  })
})
