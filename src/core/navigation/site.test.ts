import { describe, expect, test } from "bun:test"
import {
  getPostLoginPath,
  isSafeInternalPath,
  loginPath,
  parseSafeInternalPath,
  twoFactorPath
} from "./navigation-utils"

describe("site navigation", () => {
  test("uses a safe requested destination after sign-in", () => {
    expect(getPostLoginPath("user", "/account?tab=password")).toBe("/account?tab=password")
  })

  test("falls back when the requested destination is external", () => {
    expect(getPostLoginPath("user", "https://example.com/steal-session")).toBe("/")
  })

  test("sends admins with several roles to the admin area", () => {
    expect(getPostLoginPath("user,admin")).toBe("/admin")
  })

  test("preserves a safe destination through the two-factor step", () => {
    expect(twoFactorPath(["totp", "otp"], "/account?tab=password")).toBe(
      "/two-factor?methods=totp%2Cotp&returnTo=%2Faccount%3Ftab%3Dpassword"
    )
  })

  test("does not include an unsafe destination in login URLs", () => {
    expect(loginPath("https://example.com/steal-session")).toBe("/login")
    expect(twoFactorPath(["totp"], "https://example.com/steal-session")).toBe("/two-factor?methods=totp")
  })

  test("rejects control characters that URL parsing could treat as separators", () => {
    for (const control of ["\t", "\n", "\r"]) {
      const returnTo = `/${control}/example.com`
      expect(isSafeInternalPath(returnTo)).toBe(false)
      expect(getPostLoginPath("user", returnTo)).toBe("/")
      expect(loginPath(returnTo)).toBe("/login")
      expect(twoFactorPath(["totp"], returnTo)).toBe("/two-factor?methods=totp")
    }
  })

  test("revalidates a decoded returnTo across the login and two-factor flow", () => {
    const loginQuery = new URLSearchParams("returnTo=%2F%09%2Fexample.com")
    const decodedLoginReturnTo = loginQuery.get("returnTo") ?? undefined
    const twoFactorUrl = twoFactorPath(["totp"], decodedLoginReturnTo)
    const twoFactorQuery = new URL(twoFactorUrl, "http://csk-hub.local").searchParams
    const decodedTwoFactorReturnTo = twoFactorQuery.get("returnTo") ?? undefined

    expect(twoFactorQuery.has("returnTo")).toBe(false)
    expect(getPostLoginPath("user", decodedTwoFactorReturnTo)).toBe("/")
  })

  test("canonicalizes safe destinations while preserving query and hash", () => {
    expect(parseSafeInternalPath("/account/../me?tab=password#security")).toBe("/me?tab=password#security")
    expect(parseSafeInternalPath("//example.com/path")).toBeUndefined()
    expect(parseSafeInternalPath("/%2e%2e//example.com/path")).toBeUndefined()
    expect(parseSafeInternalPath("/\\\\example.com/path")).toBeUndefined()
    expect(parseSafeInternalPath("javascript:alert(1)")).toBeUndefined()
  })
})
