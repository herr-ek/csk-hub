import { afterAll, describe, expect, test } from "bun:test"
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { betterAuth } from "better-auth"
import { admin, jwt, twoFactor } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import * as schema from "@/core/db/schema/auth"
import { createTestDatabase } from "../../../test/database"
import { createOAuthProvider, oauthDisabledPaths } from "./oauth-provider"

const database = await createTestDatabase()

describe.skipIf(!database)("Hub OIDC provider", () => {
  const t = database as NonNullable<typeof database>
  let otp = ""
  const origin = "http://localhost:3000"
  const auth = betterAuth({
    baseURL: origin,
    secret: "oidc-provider-integration-test-secret-123456789",
    database: drizzleAdapter(t?.db, { provider: "pg", schema }),
    disabledPaths: ["/token", ...oauthDisabledPaths],
    emailAndPassword: { enabled: true },
    plugins: [
      admin(),
      jwt({ disableSettingJwtHeader: true }),
      twoFactor({
        otpOptions: {
          async sendOTP({ otp: value }) {
            otp = value
          }
        }
      }),
      createOAuthProvider(t?.db, true)
    ]
  })
  afterAll(() => t.drop())

  async function request(
    path: string,
    body?: Record<string, unknown> | URLSearchParams,
    cookie = "",
    authorizationHeader = ""
  ) {
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          cookie,
          ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
          accept: body ? "application/json" : "text/html",
          ...(body
            ? {
                "content-type":
                  body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json"
              }
            : {})
        },
        body: body instanceof URLSearchParams ? body : body ? JSON.stringify(body) : undefined
      })
    )
  }

  function cookies(response: Response) {
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ")
  }

  async function account(role: "admin" | "user") {
    const email = `${crypto.randomUUID()}@example.com`
    const password = "oidc-provider-test-password"
    const result = await auth.api.signUpEmail({ body: { name: "Singer", email, password } })
    await t.db.update(schema.user).set({ role }).where(eq(schema.user.id, result.user.id))
    const response = await request("/sign-in/email", { email, password })
    return {
      email,
      password,
      id: result.user.id,
      cookie: cookies(response),
      headers: new Headers({ cookie: cookies(response), origin })
    }
  }

  const verifier = "a".repeat(64)
  const challenge = Buffer.from(new Bun.CryptoHasher("sha256").update(verifier).digest()).toString("base64url")

  function authorization(clientId: string, extra: Record<string, string> = {}) {
    return `/oauth2/authorize?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://localhost:8787/callback",
      response_type: "code",
      scope: "openid profile email",
      state: "test-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...extra
    })}`
  }

  async function register(headers: Headers) {
    return auth.api.adminCreateOAuthClient({
      headers,
      body: {
        client_name: "Test app",
        redirect_uris: ["http://localhost:8787/callback"],
        application_type: "web",
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code"],
        scope: "openid profile email",
        require_pkce: true,
        skip_consent: true
      }
    })
  }

  async function exchange(clientId: string, secret: string, code: string, codeVerifier = verifier) {
    return request(
      "/oauth2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: "http://localhost:8787/callback",
        code,
        code_verifier: codeVerifier
      }),
      "",
      `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`
    )
  }

  test("shared Admin management, fresh permissions, rotation, disabling and discovery", async () => {
    const first = await account("admin")
    const second = await account("admin")
    const member = await account("user")
    const client = await register(first.headers)
    expect(client.client_secret).toBeString()
    expect(await auth.api.getOAuthClients({ headers: second.headers })).toHaveLength(1)
    await auth.api.adminUpdateOAuthClient({
      headers: second.headers,
      body: { client_id: client.client_id, update: { client_name: "Renamed" } }
    })
    expect(
      (await auth.api.getOAuthClient({ headers: second.headers, query: { client_id: client.client_id } })).client_name
    ).toBe("Renamed")
    expect(JSON.stringify(await auth.api.getOAuthClients({ headers: second.headers }))).not.toContain(
      client.client_secret as string
    )
    const strict = betterAuth({
      ...auth.options,
      plugins: [admin(), jwt({ disableSettingJwtHeader: true }), createOAuthProvider(t.db, false)]
    })
    await expect(
      strict.api.adminCreateOAuthClient({
        headers: first.headers,
        body: {
          client_name: "Invalid production callback",
          redirect_uris: ["http://localhost:8787/callback"],
          application_type: "web"
        }
      })
    ).rejects.toThrow()
    await expect(register(member.headers)).rejects.toThrow()
    for (const headers of [member.headers, new Headers()]) {
      await expect(auth.api.getOAuthClients({ headers })).rejects.toThrow()
      await expect(auth.api.rotateClientSecret({ headers, body: { client_id: client.client_id } })).rejects.toThrow()
      await expect(
        auth.api.adminUpdateOAuthClient({ headers, body: { client_id: client.client_id, update: { disabled: true } } })
      ).rejects.toThrow()
    }
    expect(
      (await request("/oauth2/create-client", { redirect_uris: ["https://example.com/callback"] }, first.cookie)).status
    ).toBe(404)
    expect((await request("/token", undefined, first.cookie)).status).toBe(404)
    const metadata = await request("/.well-known/openid-configuration")
    expect(await metadata.json()).toMatchObject({
      grant_types_supported: ["authorization_code"],
      scopes_supported: ["openid", "profile", "email"]
    })

    const authorized = await request(authorization(client.client_id), undefined, member.cookie)
    const code = new URL(authorized.headers.get("location") as string).searchParams.get("code") as string
    const rotated = await auth.api.rotateClientSecret({
      headers: second.headers,
      body: { client_id: client.client_id }
    })
    expect((await exchange(client.client_id, client.client_secret as string, code)).status).not.toBe(200)
    const token = await exchange(client.client_id, rotated.client_secret as string, code)
    expect(token.status).toBe(200)
    const tokens = await token.json()
    expect(tokens.id_token).toBeString()
    expect(tokens.refresh_token).toBeUndefined()
    const userInfo = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } })
    )
    expect(await userInfo.json()).toMatchObject({ sub: member.id, email: member.email })

    const pendingAuthorization = await request(authorization(client.client_id), undefined, member.cookie)
    const pendingCode = new URL(pendingAuthorization.headers.get("location") as string).searchParams.get(
      "code"
    ) as string
    await auth.api.adminUpdateOAuthClient({
      headers: second.headers,
      body: { client_id: client.client_id, update: { disabled: true } }
    })
    const disabledToken = await exchange(client.client_id, rotated.client_secret as string, pendingCode)
    expect(disabledToken.status).not.toBe(200)
    const disabled = await request(authorization(client.client_id), undefined, member.cookie)
    expect(disabled.headers.get("location") ?? "").not.toContain("code=")
    await auth.api.adminUpdateOAuthClient({
      headers: second.headers,
      body: { client_id: client.client_id, update: { disabled: false } }
    })
    expect(
      (await request(authorization(client.client_id), undefined, member.cookie)).headers.get("location")
    ).toContain("code=")
    await t.db.update(schema.user).set({ role: "user" }).where(eq(schema.user.id, second.id))
    await expect(auth.api.getOAuthClients({ headers: second.headers })).rejects.toThrow()
  })

  test("signed login continuation, prompt=login, explicit consent, redirect validation and PKCE", async () => {
    const owner = await account("admin")
    const member = await account("user")
    const client = await register(owner.headers)
    for (const cookie of ["", member.cookie]) {
      const start = await request(authorization(client.client_id, { prompt: "login" }), undefined, cookie)
      const login = new URL(start.headers.get("location") as string, origin)
      expect(login.pathname).toBe("/login")
      const result = await request(
        "/sign-in/email",
        { email: member.email, password: member.password, oauth_query: login.search.slice(1) },
        cookie
      )
      const continued = await result.json()
      expect(continued.redirect).toBe(true)
      const callback = new URL(continued.url)
      expect(callback.searchParams.get("state")).toBe("test-state")
      const code = callback.searchParams.get("code") as string
      expect((await exchange(client.client_id, client.client_secret as string, code, "b".repeat(64))).status).not.toBe(
        200
      )
    }
    const consent = await request(authorization(client.client_id, { prompt: "consent" }), undefined, member.cookie)
    const consentUrl = new URL(consent.headers.get("location") as string, origin)
    expect(consentUrl.pathname).toBe("/oauth/consent")
    const accepted = await request(
      "/oauth2/consent",
      { accept: true, oauth_query: consentUrl.search.slice(1) },
      member.cookie
    )
    expect((await accepted.json()).url).toContain("code=")
    const invalid = await request(
      authorization(client.client_id, { redirect_uri: "https://attacker.example/callback" }),
      undefined,
      member.cookie
    )
    expect(invalid.headers.get("location") ?? "").not.toContain("https://attacker.example")
    const noPkce = new URL(authorization(client.client_id), origin)
    noPkce.searchParams.delete("code_challenge")
    const denied = await request(`${noPkce.pathname}${noPkce.search}`, undefined, member.cookie)
    expect(denied.headers.get("location") ?? "").not.toContain("code=")
  })

  test("authorization survives password login and two-factor OTP verification", async () => {
    const owner = await account("admin")
    const member = await account("user")
    const client = await register(owner.headers)
    await auth.api.enableTwoFactor({ headers: member.headers, body: { password: member.password } })
    await auth.api.sendTwoFactorOTP({ headers: member.headers })
    await auth.api.verifyTwoFactorOTP({ headers: member.headers, body: { code: otp } })
    const start = await request(authorization(client.client_id))
    const login = new URL(start.headers.get("location") as string, origin)
    const oauth_query = login.search.slice(1)
    const password = await request("/sign-in/email", { email: member.email, password: member.password, oauth_query })
    expect(await password.json()).toMatchObject({ twoFactorRedirect: true })
    const cookie = cookies(password)
    expect((await request("/two-factor/send-otp", { oauth_query }, cookie)).status).toBe(200)
    const verified = await request("/two-factor/verify-otp", { code: otp, oauth_query }, cookie)
    expect(await verified.json()).toMatchObject({ redirect: true, url: expect.stringContaining("code=") })
  })
})
