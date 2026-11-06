import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { betterAuth } from "better-auth"
import { admin, emailOTP, magicLink, twoFactor } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose"
import * as oidc from "openid-client"
import * as schema from "@/core/db/schema/auth"
import { createTestDatabase } from "../../../../test/database"
import { createOidcClientHandler } from "./clients.server"
import { getVerifiedConsentQuery } from "./consent.server"
import { createOidcPlugins } from "./provider"
import { resumeOidcRequest } from "./resume.server"

const database = await createTestDatabase()

describe.skipIf(!database)("registered applications over HTTP", () => {
  if (!database) return
  const t = database
  const server = Bun.serve({
    port: 0,
    fetch: (request): Promise<Response> =>
      new URL(request.url).pathname === "/api/oidc/resume"
        ? resumeOidcRequest(request, auth)
        : new URL(request.url).pathname.startsWith("/api/oidc/clients")
          ? createOidcClientHandler(auth)(request)
          : auth.handler(request)
  })
  const origin = server.url.origin
  const issuer = `${origin}/api/auth`
  const deliveries = new Map<string, string>()
  function makeAuth() {
    return betterAuth({
      baseURL: origin,
      secret: "oidc-integration-test-secret-at-least-32-characters",
      database: drizzleAdapter(t.db, { provider: "pg", schema }),
      emailAndPassword: { enabled: true },
      advanced: { disableOriginCheck: false, disableCSRFCheck: false },
      session: { cookieCache: { enabled: true, maxAge: 300 } },
      plugins: [
        admin(),
        twoFactor({
          skipVerificationOnEnable: true,
          otpOptions: {
            sendOTP: async ({ user, otp }) => {
              deliveries.set(user.email, otp)
            }
          }
        }),
        emailOTP({
          disableSignUp: true,
          sendVerificationOTP: async ({ email, otp }) => {
            deliveries.set(email, otp)
          }
        }),
        magicLink({
          disableSignUp: true,
          sendMagicLink: async ({ email, url }) => {
            deliveries.set(email, url)
          }
        }),
        ...createOidcPlugins({ database: t.db, issuer, environment: "test" })
      ]
    })
  }
  let auth = makeAuth()
  afterAll(async () => {
    server.stop(true)
    await t.drop()
  })

  let adminCookie: string
  let adminId: string
  let userCookie: string
  let userId: string
  let client: { client_id: string; client_secret?: string }
  const callback = "https://client.example.com/callback/"

  async function signIn(email: string) {
    const response = await fetch(`${issuer}/sign-in/email`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "oidc-test-password" })
    })
    expect(response.status).toBe(200)
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")
  }

  beforeAll(async () => {
    const administrator = await auth.api.signUpEmail({
      body: { name: "Admin", email: "admin@example.com", password: "oidc-test-password" }
    })
    adminId = administrator.user.id
    await t.db
      .update(schema.user)
      .set({ role: "admin", emailVerified: true })
      .where(eq(schema.user.id, administrator.user.id))
    adminCookie = await signIn("admin@example.com")
    const member = await auth.api.signUpEmail({
      body: { name: "Singer", email: "singer@example.com", password: "oidc-test-password" }
    })
    await t.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, member.user.id))
    userId = member.user.id
    userCookie = await signIn("singer@example.com")
    client = await auth.api.adminCreateOAuthClient({
      headers: new Headers({ cookie: adminCookie }),
      body: {
        client_name: "Website",
        redirect_uris: [callback],
        scope: "openid profile",
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code"],
        skip_consent: true,
        require_pkce: true,
        subject_type: "public"
      }
    })
  })

  async function configFor(registered = client) {
    return oidc.discovery(
      new URL(issuer),
      registered.client_id,
      registered.client_secret,
      oidc.ClientSecretBasic(registered.client_secret ?? ""),
      { execute: [oidc.allowInsecureRequests] }
    )
  }

  async function authorize(cookie = userCookie, registered = client) {
    const config = await configFor(registered)
    const verifier = oidc.randomPKCECodeVerifier()
    const state = oidc.randomState()
    const nonce = oidc.randomNonce()
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callback,
      scope: "openid profile",
      response_type: "code",
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256"
    })
    const response = await fetch(url, { headers: { cookie }, redirect: "manual" })
    expect(response.status).toBe(302)
    return { config, verifier, state, nonce, location: new URL(response.headers.get("location") ?? "", origin), url }
  }

  async function exchange(flow: Awaited<ReturnType<typeof authorize>>) {
    return oidc.authorizationCodeGrant(flow.config, flow.location, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce
    })
  }

  test("a conventional confidential client verifies identity and reads matching UserInfo", async () => {
    const flow = await authorize()
    expect(flow.location.origin).toBe("https://client.example.com")
    const tokens = await oidc.authorizationCodeGrant(flow.config, flow.location, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true
    })
    expect(tokens.claims()).toMatchObject({ iss: issuer, sub: userId, aud: client.client_id })
    expect(tokens.refresh_token).toBeUndefined()
    const identity = await oidc.fetchUserInfo(flow.config, tokens.access_token, userId)
    expect(identity).toMatchObject({ sub: userId, name: "Singer" })
    await expect(exchange(flow)).rejects.toThrow()
  })

  test("ordinary Users and public requests cannot register or manage clients", async () => {
    for (const cookie of ["", userCookie]) {
      for (const path of [
        "/oauth2/create-client",
        "/oauth2/register",
        "/oauth2/update-client",
        "/oauth2/client/rotate-secret",
        "/oauth2/delete-client"
      ]) {
        const response = await fetch(`${issuer}${path}`, {
          method: "POST",
          headers: { Origin: origin, cookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: client.client_id,
            redirect_uris: [callback],
            update: { client_name: "Hijack" }
          })
        })
        expect(response.ok).toBe(false)
      }
      await expect(
        auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie }), body: { redirect_uris: [callback] } })
      ).rejects.toThrow()
      await expect(
        auth.api.adminUpdateOAuthClient({
          headers: new Headers({ cookie }),
          body: { client_id: client.client_id, update: { skip_consent: true } }
        })
      ).rejects.toThrow()
      await expect(
        auth.api.adminCreateOAuthResource({
          headers: new Headers({ cookie }),
          body: { identifier: "https://api.example.com" }
        })
      ).rejects.toThrow()
    }
  })

  test("a second client requires consent and completes the same identity flow", async () => {
    const second = await auth.api.adminCreateOAuthClient({
      headers: new Headers({ cookie: adminCookie }),
      body: {
        client_name: "Other application",
        redirect_uris: [callback],
        scope: "openid profile",
        token_endpoint_auth_method: "client_secret_basic"
      }
    })
    const flow = await authorize(userCookie, second)
    expect(flow.location.pathname).toBe("/oidc/consent")
    const query = new URLSearchParams(flow.location.search)
    const { secret } = await auth.$context
    query.set("returnTo", "/unrelated")
    const verified = await getVerifiedConsentQuery(query.toString(), secret)
    expect(verified?.clientId).toBe(second.client_id)
    expect(verified?.scopes).toEqual(["openid", "profile"])
    expect(verified?.oauthQuery).not.toContain("returnTo")
    for (const [key, value] of [
      ["client_id", "other-client"],
      ["scope", "openid"],
      ["exp", "1"],
      ["sig", "invalid"]
    ]) {
      const tampered = new URLSearchParams(query)
      tampered.set(key, value)
      expect(await getVerifiedConsentQuery(tampered.toString(), secret)).toBeNull()
    }
    expect(await getVerifiedConsentQuery("client_id=unsigned", secret)).toBeNull()
    const response = await fetch(`${issuer}/oauth2/consent`, {
      method: "POST",
      headers: { Origin: origin, cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ accept: true, oauth_query: flow.location.search.slice(1) })
    })
    expect(response.status).toBe(200)
    const result = await response.json()
    const tokens = await oidc.authorizationCodeGrant(flow.config, new URL(result.url), {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true
    })
    expect(await oidc.fetchUserInfo(flow.config, tokens.access_token, userId)).toMatchObject({ sub: userId })
  })

  test("fresh password sign-in retains the signed authorization request", async () => {
    const flow = await authorize("")
    expect(flow.location.pathname).toBe("/login")
    const response = await fetch(`${issuer}/sign-in/email`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "singer@example.com",
        password: "oidc-test-password",
        oauth_query: flow.location.search.slice(1)
      })
    })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(new URL(result.url).pathname).toBe("/callback/")
    const tokens = await oidc.authorizationCodeGrant(flow.config, new URL(result.url), {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true
    })
    expect(tokens.claims()?.sub).toBe(userId)
  })

  test("bad PKCE and wrong client credentials cannot exchange codes", async () => {
    const badPkce = await authorize()
    await expect(
      oidc.authorizationCodeGrant(badPkce.config, badPkce.location, {
        pkceCodeVerifier: oidc.randomPKCECodeVerifier(),
        expectedState: badPkce.state,
        expectedNonce: badPkce.nonce
      })
    ).rejects.toThrow()
    const flow = await authorize()
    const wrongClient = await configFor({ ...client, client_secret: "incorrect-secret" })
    await expect(
      oidc.authorizationCodeGrant(wrongClient, flow.location, {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce
      })
    ).rejects.toThrow()
  })

  test("unregistered redirects, including a missing trailing slash, are rejected", async () => {
    for (const redirect of ["https://client.example.com/callback", "https://attacker.example.com/callback/"]) {
      const flow = await authorize()
      flow.url.searchParams.set("redirect_uri", redirect)
      const response = await fetch(flow.url, { headers: { cookie: userCookie }, redirect: "manual" })
      expect(response.status).toBe(302)
      const errorUrl = new URL(response.headers.get("location") ?? "", origin)
      expect(errorUrl.origin).toBe(origin)
      expect(errorUrl.searchParams.get("error")).toBe("invalid_redirect")
    }
  })

  test("revoking a client token leaves the Hub browser session usable", async () => {
    const flow = await authorize()
    const tokens = await exchange(flow)
    await oidc.tokenRevocation(flow.config, tokens.access_token)
    await expect(oidc.fetchUserInfo(flow.config, tokens.access_token, userId)).rejects.toThrow()
    const response = await fetch(`${issuer}/get-session`, { headers: { cookie: userCookie } })
    expect(await response.json()).toMatchObject({ user: { id: userId } })
  })

  test("a disabled client cannot exchange a code or use an issued token", async () => {
    const issued = await authorize()
    const tokens = await exchange(issued)
    const pending = await authorize()
    await auth.api.adminUpdateOAuthClient({
      headers: new Headers({ cookie: adminCookie }),
      body: { client_id: client.client_id, update: { disabled: true } }
    })
    try {
      await expect(oidc.fetchUserInfo(issued.config, tokens.access_token, userId)).rejects.toThrow()
      await expect(exchange(pending)).rejects.toThrow()
    } finally {
      await auth.api.adminUpdateOAuthClient({
        headers: new Headers({ cookie: adminCookie }),
        body: { client_id: client.client_id, update: { disabled: false } }
      })
    }
  })

  test("inactive Users cannot issue or use tokens despite a cached cookie", async () => {
    const issued = await authorize()
    const tokens = await exchange(issued)
    const pending = await authorize()
    await t.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId))
    try {
      const response = await fetch(pending.url, { headers: { cookie: userCookie }, redirect: "manual" })
      expect(response.status).toBe(403)
      await expect(oidc.fetchUserInfo(issued.config, tokens.access_token, userId)).rejects.toThrow()
      await expect(exchange(pending)).rejects.toThrow()
    } finally {
      await t.db.update(schema.user).set({ banned: false }).where(eq(schema.user.id, userId))
    }
  })

  test("administrator HTTP workflow creates, inspects, updates, disables and rotates a client", async () => {
    const headers = { cookie: adminCookie, Origin: origin, "Content-Type": "application/json" }
    const response = await fetch(`${origin}/api/oidc/clients`, {
      method: "POST",
      headers,
      body: JSON.stringify({ client_name: "Managed app", redirect_uris: [callback] })
    })
    expect(response.status).toBe(200)
    const managed = await response.json()
    expect(managed).toMatchObject({ token_endpoint_auth_method: "client_secret_basic", require_pkce: true })
    expect(typeof managed.client_secret).toBe("string")
    const listed = await fetch(`${origin}/api/oidc/clients`, { headers })
    expect(listed.status).toBe(200)
    expect(JSON.stringify(await listed.json())).not.toContain(managed.client_secret)
    const rotation = await fetch(`${origin}/api/oidc/clients/rotate-secret`, {
      method: "POST",
      headers,
      body: JSON.stringify({ client_id: managed.client_id })
    })
    expect(rotation.status).toBe(200)
    const rotated = await rotation.json()
    expect(rotated.client_secret).not.toBe(managed.client_secret)
    const disabled = await fetch(`${origin}/api/oidc/clients`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        client_id: managed.client_id,
        update: { disabled: true, skip_consent: true, client_name: "Updated" }
      })
    })
    expect(disabled.status).toBe(200)
    for (const cookie of ["", userCookie]) {
      expect((await fetch(`${origin}/api/oidc/clients`, { headers: { cookie } })).ok).toBe(false)
      expect(
        (
          await fetch(`${origin}/api/oidc/clients`, {
            method: "POST",
            headers: { ...headers, cookie },
            body: JSON.stringify({ client_name: "Untrusted", redirect_uris: [callback] })
          })
        ).ok
      ).toBe(false)
    }
    expect(
      (
        await fetch(`${origin}/api/oidc/clients`, {
          method: "POST",
          headers: { ...headers, Origin: "https://attacker.example.com" },
          body: "{}"
        })
      ).status
    ).toBe(403)
  })

  test("removing Admin authority takes effect despite its cached cookie", async () => {
    await t.db.update(schema.user).set({ role: "user" }).where(eq(schema.user.id, adminId))
    try {
      await expect(
        auth.api.adminCreateOAuthClient({
          headers: new Headers({ cookie: adminCookie }),
          body: { redirect_uris: [callback] }
        })
      ).rejects.toThrow()
      await expect(
        auth.api.adminUpdateOAuthClient({
          headers: new Headers({ cookie: adminCookie }),
          body: { client_id: client.client_id, update: { disabled: true } }
        })
      ).rejects.toThrow()
    } finally {
      await t.db.update(schema.user).set({ role: "admin", emailVerified: true }).where(eq(schema.user.id, adminId))
    }
  })

  test("ended sessions and Erasure prevent use of old cookies, codes and tokens", async () => {
    for (const erase of [false, true]) {
      const email = `${crypto.randomUUID()}@example.com`
      const person = await auth.api.signUpEmail({ body: { name: "Temporary", email, password: "oidc-test-password" } })
      const cookie = await signIn(email)
      const issued = await authorize(cookie)
      const tokens = await exchange(issued)
      const pending = await authorize(cookie)
      if (erase) await t.db.delete(schema.user).where(eq(schema.user.id, person.user.id))
      else await t.db.delete(schema.session).where(eq(schema.session.userId, person.user.id))
      await expect(oidc.fetchUserInfo(issued.config, tokens.access_token, person.user.id)).rejects.toThrow()
      await expect(exchange(pending)).rejects.toThrow()
      const response = await fetch(pending.url, { headers: { cookie }, redirect: "manual" })
      expect(response.status).toBe(401)
    }
  })

  function cookiesFrom(response: Response) {
    return response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ")
  }

  async function postAuth(path: string, body: unknown, cookie = "") {
    return fetch(`${issuer}${path}`, {
      method: "POST",
      headers: { Origin: origin, cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual"
    })
  }

  test("two-factor sign-in resumes only after the complete challenge", async () => {
    const email = "two-factor@example.com"
    const member = await auth.api.signUpEmail({
      body: { name: "Protected Singer", email, password: "oidc-test-password" }
    })
    const sessionCookie = await signIn(email)
    await auth.api.enableTwoFactor({
      headers: new Headers({ cookie: sessionCookie }),
      body: { password: "oidc-test-password" }
    })
    const flow = await authorize("")
    const query = flow.location.search.slice(1)
    const password = await postAuth("/sign-in/email", { email, password: "oidc-test-password", oauth_query: query })
    const step = await password.json()
    expect(step.twoFactorRedirect).toBe(true)
    expect(step.url).toBeUndefined()
    const challengeCookie = cookiesFrom(password)
    const sent = await postAuth("/two-factor/send-otp", { oauth_query: query }, challengeCookie)
    expect(sent.status).toBe(200)
    const completed = await postAuth(
      "/two-factor/verify-otp",
      { code: deliveries.get(email), oauth_query: query },
      `${challengeCookie}; ${cookiesFrom(sent)}`
    )
    expect(completed.status).toBe(200)
    const result = await completed.json()
    const tokens = await oidc.authorizationCodeGrant(flow.config, new URL(result.url), {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce
    })
    expect(tokens.claims()?.sub).toBe(member.user.id)
  })

  test("passwordless email OTP preserves the authorization request", async () => {
    const flow = await authorize("")
    const sent = await postAuth("/email-otp/send-verification-otp", {
      email: "singer@example.com",
      type: "sign-in",
      oauth_query: flow.location.search.slice(1)
    })
    expect(sent.status).toBe(200)
    const completed = await postAuth("/sign-in/email-otp", {
      email: "singer@example.com",
      otp: deliveries.get("singer@example.com"),
      oauth_query: flow.location.search.slice(1)
    })
    expect(completed.status).toBe(200)
    const result = await completed.json()
    const tokens = await oidc.authorizationCodeGrant(flow.config, new URL(result.url), {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce
    })
    expect(tokens.claims()?.sub).toBe(userId)
  })

  test("magic-link sign-in waits for required activation and then resumes", async () => {
    const email = "invite@example.com"
    const member = await auth.api.createUser({ body: { name: "Invited Singer", email } })
    const flow = await authorize("")
    const sent = await postAuth("/sign-in/magic-link", {
      email,
      callbackURL: `${origin}/activate`,
      oauth_query: flow.location.search.slice(1)
    })
    expect(sent.status).toBe(200)
    const verification = await fetch(deliveries.get(email) ?? "", { redirect: "manual" })
    expect(verification.status).toBe(302)
    const resumed = await fetch(new URL(verification.headers.get("location") ?? "", origin), {
      headers: { cookie: cookiesFrom(verification) },
      redirect: "manual"
    })
    const destination = new URL(resumed.headers.get("location") ?? "", origin)
    expect(destination.pathname).toBe("/activate")
    expect(destination.searchParams.has("code")).toBe(false)
    const cookie = cookiesFrom(verification)
    await auth.api.setPassword({ headers: new Headers({ cookie }), body: { newPassword: "activated-test-password" } })
    const completed = await postAuth(
      "/oauth2/continue",
      { created: true, oauth_query: destination.search.slice(1) },
      cookie
    )
    expect(completed.status).toBe(200)
    const result = await completed.json()
    const tokens = await oidc.authorizationCodeGrant(flow.config, new URL(result.url), {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce
    })
    expect(tokens.claims()?.sub).toBe(member.user.id)
  })

  test("signing keys survive restart and rotate with verification overlap", async () => {
    const first = await authorize()
    const tokens = await exchange(first)
    const originalKey = decodeProtectedHeader(tokens.id_token ?? "").kid
    auth = makeAuth()
    const restarted = await authorize()
    const afterRestart = await exchange(restarted)
    expect(decodeProtectedHeader(afterRestart.id_token ?? "").kid).toBe(originalKey)
    // Arrange the scheduled rotation boundary without waiting thirty days.
    await t.db.update(schema.jwks).set({ expiresAt: new Date(Date.now() - 1000) })
    auth = makeAuth()
    const rotated = await authorize()
    const afterRotation = await exchange(rotated)
    expect(decodeProtectedHeader(afterRotation.id_token ?? "").kid).not.toBe(originalKey)
    const publicKeys = await (await fetch(`${issuer}/jwks`)).json()
    const keys = createLocalJWKSet(publicKeys)
    for (const token of [tokens.id_token, afterRotation.id_token]) {
      const verified = await jwtVerify(token ?? "", keys, { issuer, audience: client.client_id })
      expect(verified.payload.sub).toBe(userId)
    }
  })

  test("secret rotation invalidates the old client credential", async () => {
    const managed = await auth.api.adminCreateOAuthClient({
      headers: new Headers({ cookie: adminCookie }),
      body: { redirect_uris: [callback], skip_consent: true }
    })
    const issued = await authorize(userCookie, managed)
    const tokens = await exchange(issued)
    const flow = await authorize(userCookie, managed)
    const rotated = await auth.api.rotateClientSecret({
      headers: new Headers({ cookie: adminCookie }),
      body: { client_id: managed.client_id }
    })
    await expect(exchange(flow)).rejects.toThrow()
    await expect(oidc.fetchUserInfo(issued.config, tokens.access_token, userId)).rejects.toThrow()
    const next = await authorize(userCookie, { ...managed, client_secret: rotated.client_secret })
    const nextTokens = await exchange(next)
    expect(nextTokens.claims()?.sub).toBe(userId)
  })

  test("impersonated sessions cannot export an identity or manage trusted clients", async () => {
    const response = await auth.api.impersonateUser({
      headers: new Headers({ cookie: adminCookie }),
      body: { userId },
      asResponse: true
    })
    const cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ")
    const flow = await authorize()
    const authorization = await fetch(flow.url, { headers: { cookie }, redirect: "manual" })
    expect([401, 403]).toContain(authorization.status)
    await expect(
      auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie }), body: { redirect_uris: [callback] } })
    ).rejects.toThrow()
  })

  test("publishes a stable issuer and S256 authorization-code metadata", async () => {
    const config = await oidc.discovery(new URL(issuer), "test", undefined, undefined, {
      execute: [oidc.allowInsecureRequests]
    })
    expect(config.serverMetadata()).toMatchObject({
      issuer,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"]
    })
  })
})
