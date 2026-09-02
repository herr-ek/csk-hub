import { describe, expect, test } from "bun:test"
import { getPostLoginPath, loginPath, twoFactorPath } from "./navigation-utils"

describe("site navigation", () => {
  test("uses a safe requested destination after sign-in", () => {
    expect(getPostLoginPath("user", "/account?tab=password")).toBe("/account?tab=password")
  })

  test("falls back when the requested destination is external", () => {
    expect(getPostLoginPath("user", "https://example.com/steal-session")).toBe("/")
  })

  test("sends admins with several roles to the admin area", () => {
    expect(getPostLoginPath("member,admin")).toBe("/admin")
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
})
