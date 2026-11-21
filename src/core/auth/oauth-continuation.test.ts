import { expect, test } from "bun:test"
import { getOAuthResumePath, isOAuthRedirect, withOAuthQuery } from "./oauth-continuation"

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

test("a fresh session resumes the authorization and preserves state, PKCE and consent", () => {
  const query = new URLSearchParams({
    sig: "signature",
    exp: "999",
    ba_iat: "123",
    client_id: "app",
    redirect_uri: "https://app.example/callback",
    state: "request-state",
    code_challenge: "challenge",
    prompt: "login consent",
    max_age: "0"
  })
  for (const name of [...query.keys(), "resource"]) query.append("ba_param", name)
  query.append("resource", "https://api.example/first")
  query.append("resource", "https://api.example/second")
  query.set("returnTo", "/news")

  const path = getOAuthResumePath(query.toString(), new Date(123))
  expect(path).toStartWith("/api/auth/oauth2/authorize?")
  expect([...new URL(path as string, "http://localhost").searchParams]).toEqual([
    ["client_id", "app"],
    ["redirect_uri", "https://app.example/callback"],
    ["state", "request-state"],
    ["code_challenge", "challenge"],
    ["prompt", "consent"],
    ["resource", "https://api.example/first"],
    ["resource", "https://api.example/second"]
  ])
  expect(getOAuthResumePath(query.toString(), new Date(122))).toBeUndefined()
  query.delete("sig")
  expect(getOAuthResumePath(query.toString(), new Date(123))).toBeUndefined()
})
