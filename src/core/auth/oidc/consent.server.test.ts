import { expect, test } from "bun:test"
import { makeSignature } from "better-auth/crypto"
import { getVerifiedConsentQuery } from "./consent.server"

const secret = "consent-verification-test-secret-at-least-32-characters"

async function signedQuery(expiresAt = Math.floor(Date.now() / 1000) + 600) {
  const params = new URLSearchParams({ client_id: "application-a", scope: "openid profile", exp: String(expiresAt) })
  for (const key of ["client_id", "scope", "exp", "ba_param"]) params.append("ba_param", key)
  const canonical = new URLSearchParams(
    [...params.entries()].sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
  )
  params.set("sig", await makeSignature(canonical.toString(), secret))
  return params
}

test("consent displays only verified fields and retains the signed submission", async () => {
  const params = await signedQuery()
  params.set("returnTo", "/unrelated-page")
  const verified = await getVerifiedConsentQuery(params.toString(), secret)
  expect(verified?.clientId).toBe("application-a")
  expect(verified?.scopes).toEqual(["openid", "profile"])
  expect(verified?.oauthQuery).not.toContain("returnTo")
})

test("consent rejects tampered application, scopes, signature and expired requests", async () => {
  for (const [key, value] of [
    ["client_id", "application-b"],
    ["scope", "openid"],
    ["sig", "invalid"]
  ]) {
    const params = await signedQuery()
    params.set(key, value)
    expect(await getVerifiedConsentQuery(params.toString(), secret)).toBeNull()
  }
  expect(await getVerifiedConsentQuery((await signedQuery(1)).toString(), secret)).toBeNull()
  expect(await getVerifiedConsentQuery("client_id=application-a&scope=openid", secret)).toBeNull()
})
