import { expect, test } from "@playwright/test"
import * as oidc from "openid-client"

const issuer = "http://localhost:3107/api/auth"

/** Register through the same authenticated administrator HTTP transport used by operators. */
async function register(request: import("@playwright/test").APIRequestContext, skipConsent: boolean) {
  const login = await request.post(`${issuer}/sign-in/email`, {
    data: { email: "browser@example.com", password: "browser-test-password" }
  })
  expect(login.ok()).toBe(true)
  const response = await request.post("http://localhost:3107/api/oidc/clients", {
    headers: { Origin: "http://localhost:3107" },
    data: {
      client_name: "Browser application",
      redirect_uris: ["https://client.example.com:3108/callback/"],
      skip_consent: skipConsent
    }
  })
  expect(response.ok()).toBe(true)
  const registered = await response.json()
  return oidc.discovery(
    new URL(issuer),
    registered.client_id,
    registered.client_secret,
    oidc.ClientSecretBasic(registered.client_secret),
    { execute: [oidc.allowInsecureRequests] }
  )
}

async function authorization(config: oidc.Configuration) {
  const verifier = oidc.randomPKCECodeVerifier()
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: "https://client.example.com:3108/callback/",
    scope: "openid profile",
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256"
  })
  return { url, verifier, state, nonce }
}

test("fresh browser login resumes the registered callback, and the Hub session works again", async ({
  page,
  request
}) => {
  const config = await register(request, true)
  const flow = await authorization(config)
  await page.goto(flow.url.toString())
  await expect(page).toHaveURL(/\/login\?/)
  await page.locator('input[name="identifier"]').fill("browser@example.com")
  await page.locator('input[name="password"]').fill("browser-test-password")
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/^https:\/\/client.example.com:3108\/callback\/\?/, { timeout: 30_000 })
  const tokens = await oidc.authorizationCodeGrant(config, new URL(page.url()), {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true
  })
  expect(tokens.claims()?.iss).toBe(issuer)
  const next = await authorization(config)
  await page.goto(next.url.toString())
  await expect(page).toHaveURL(/^https:\/\/client.example.com:3108\/callback\/\?/)
})

test("an ordinary application shows consent and cancellation returns an OIDC error", async ({ page, request }) => {
  const config = await register(request, false)
  const flow = await authorization(config)
  await page.goto(flow.url.toString())
  await page.locator('input[name="identifier"]').fill("browser@example.com")
  await page.locator('input[name="password"]').fill("browser-test-password")
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/oidc\/consent\?/)
  await expect(page.getByText("Browser application", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: /Cancel|Avbryt|Abbrechen/ }).click()
  await expect(page).toHaveURL(/error=access_denied/)
  expect(new URL(page.url()).searchParams.has("code")).toBe(false)
})

test("a real passkey sign-in retains the application request", async ({ page, request, context }) => {
  const config = await register(request, true)
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: "http://localhost:3107" }])
  const cdp = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  })
  const login = await page.request.post(`${issuer}/sign-in/email`, {
    headers: { Origin: "http://localhost:3107" },
    data: { email: "browser@example.com", password: "browser-test-password" }
  })
  expect(login.ok()).toBe(true)
  await page.goto("/me/settings")
  await page.getByRole("tab", { name: "Security", exact: true }).click()
  await page.getByRole("button", { name: "Add passkey", exact: true }).click()
  await expect(page.getByText("Passkey added.", { exact: true })).toBeVisible()
  await context.clearCookies()
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: "http://localhost:3107" }])
  const flow = await authorization(config)
  await page.goto(flow.url.toString())
  await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).click()
  await expect(page).toHaveURL(/^https:\/\/client.example.com:3108\/callback\/\?/, { timeout: 30_000 })
  const tokens = await oidc.authorizationCodeGrant(config, new URL(page.url()), {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true
  })
  expect(tokens.claims()?.iss).toBe(issuer)
})
