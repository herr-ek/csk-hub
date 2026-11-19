import { expect, test } from "bun:test"
import { isOAuthRedirect, withOAuthQuery } from "./oauth-continuation"

test("two-factor navigation preserves repeated signed parameters and excludes Hub-only parameters", () => {
  const query =
    "client_id=app&sig=signature&ba_param=client_id&ba_param=ba_param&ba_param=ba_iat&ba_iat=123&returnTo=%2Fevil&methods=bad"
  const path = new URL(withOAuthQuery("/two-factor?methods=totp&returnTo=%2Fnews", query), "http://localhost")
  expect(path.searchParams.getAll("ba_param")).toEqual(["client_id", "ba_param", "ba_iat"])
  expect(path.searchParams.get("sig")).toBe("signature")
  expect(path.searchParams.get("client_id")).toBe("app")
  expect(path.searchParams.get("methods")).toBe("totp")
  expect(path.searchParams.get("returnTo")).toBe("/news")
  expect(withOAuthQuery("/two-factor?methods=otp", "client_id=app")).toBe("/two-factor?methods=otp")
})

test("only redirect responses with a URL suppress ordinary Hub navigation", () => {
  expect(isOAuthRedirect({ redirect: true, url: "https://app.example/callback" })).toBe(true)
  for (const data of [null, {}, { redirect: false, url: "/" }, { redirect: true }])
    expect(isOAuthRedirect(data)).toBe(false)
})
