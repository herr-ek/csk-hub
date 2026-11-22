import { afterAll, describe, expect, test } from "bun:test"
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { betterAuth } from "better-auth"
import { admin, jwt } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import * as schema from "@/core/db/schema/auth"
import { directMembership, group } from "@/core/db/schema/org-structure"
import { cskToday, currentOrganisationYear, GroupType, organisationYearPeriod } from "@/core/org-structure"
import { createTestDatabase } from "../../../test/database"
import { createAuthPlugins } from "./auth-plugins"
import { getOAuthResumePath } from "./oauth-continuation"
import { createOAuthProvider, oauthDisabledPaths } from "./oauth-provider"
import { websiteAdminClaim, websiteScope } from "./website-access"

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
      ...createAuthPlugins(t?.db, true, async ({ otp: value }) => {
        otp = value
      })
    ]
  })
  afterAll(() => t.drop())

  async function request(
    path: string,
    body?: Record<string, unknown> | URLSearchParams,
    cookie = "",
    authorizationHeader = "",
    accept = body ? "application/json" : "text/html"
  ) {
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          cookie,
          ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
          accept,
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

  test("discovery metadata uses the allowed preview request host and auth path", async () => {
    const deployment = "https://deployment.example.test"
    const branch = "branch.example.test"
    const preview = betterAuth({
      ...auth.options,
      baseURL: { allowedHosts: [new URL(deployment).host, branch], fallback: deployment, protocol: "https" },
      plugins: [...createAuthPlugins(t.db, true, async () => {})]
    })
    const metadata = await preview.api.getOpenIdConfig({ headers: new Headers({ host: branch }) })
    expect(metadata.issuer).toBe(`https://${branch}/api/auth`)
  })

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
        auth.api.adminUpdateOAuthClient({
          headers,
          body: { client_id: client.client_id, update: { disabled: true } }
        })
      ).rejects.toThrow()
    }
    expect(
      (await request("/oauth2/create-client", { redirect_uris: ["https://example.com/callback"] }, first.cookie)).status
    ).toBe(404)
    expect((await request("/token", undefined, first.cookie)).status).toBe(404)
    const metadata = await request("/.well-known/openid-configuration")
    expect(await metadata.json()).toMatchObject({
      grant_types_supported: ["authorization_code"],
      scopes_supported: ["openid", "profile", "email", websiteScope]
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
    const start = await request(authorization(client.client_id, { prompt: "login", max_age: "0" }))
    const login = new URL(start.headers.get("location") as string, origin)
    const oauth_query = login.search.slice(1)
    const password = await request(
      "/sign-in/email",
      { email: member.email, password: member.password, oauth_query },
      "",
      "",
      "text/html"
    )
    expect(password.headers.get("location")).toBeNull()
    expect(await password.json()).toMatchObject({ twoFactorRedirect: true })
    const cookie = cookies(password)
    expect((await request("/two-factor/send-otp", { oauth_query }, cookie)).status).toBe(200)
    const verified = await request("/two-factor/verify-otp", { code: otp, oauth_query }, cookie)
    expect(await verified.json()).toMatchObject({ redirect: true, url: expect.stringContaining("code=") })

    const sessionCookie = cookies(verified)
    const sessionResponse = await request("/get-session", undefined, sessionCookie)
    const session: typeof auth.$Infer.Session | null = await sessionResponse.json()
    if (!session) throw new Error("Expected a session after two-factor verification")
    const resume = getOAuthResumePath(login.search, new Date(session.session.createdAt))
    if (!resume) throw new Error("Expected an authorization URL for the recovered session")
    const resumed = await auth.handler(new Request(new URL(resume, origin), { headers: { cookie: sessionCookie } }))
    const callback = new URL(resumed.headers.get("location") as string, origin)
    expect(callback.origin).toBe("http://localhost:8787")
    expect(callback.searchParams.get("state")).toBe("test-state")
    expect(callback.searchParams.get("code")).toBeTruthy()
  })

  test("website client UserInfo grants access only to active Admins and current Webmästeriet members", async () => {
    const admin = await account("admin")
    const member = await account("user")
    const client = await register(admin.headers)
    const scope = `openid profile ${websiteScope}`

    async function authorize(subject: typeof admin, requestedScope: string) {
      return request(authorization(client.client_id, { scope: requestedScope }), undefined, subject.cookie)
    }

    async function userInfo(subject: typeof admin, requestedScope: string) {
      const response = await authorize(subject, requestedScope)
      const callback = new URL(response.headers.get("location") as string)
      const code = callback.searchParams.get("code")
      expect(code).toBeTruthy()
      const token = await exchange(client.client_id, client.client_secret as string, code as string)
      expect(token.status).toBe(200)
      const { access_token } = await token.json()
      return () => request("/oauth2/userinfo", undefined, "", `Bearer ${access_token}`)
    }

    const deniedScope = await authorize(admin, scope)
    expect(deniedScope.headers.get("location") ?? (await deniedScope.text())).toContain("invalid_scope")

    await auth.api.adminUpdateOAuthClient({
      headers: admin.headers,
      body: { client_id: client.client_id, update: { scope: `${scope} email` } }
    })

    const identityOnly = await userInfo(admin, "openid profile")
    expect((await (await identityOnly()).json())[websiteAdminClaim]).toBeUndefined()
    const adminInfo = await userInfo(admin, scope)
    const memberInfo = await userInfo(member, scope)
    expect((await (await adminInfo()).json())[websiteAdminClaim]).toBe(true)
    expect((await (await memberInfo()).json())[websiteAdminClaim]).toBeUndefined()

    const today = cskToday()
    const organisationYear = currentOrganisationYear(today)
    const [webTeam] = await t.db
      .insert(group)
      .values({ type: GroupType.WebTeam, organisationYear })
      .returning({ id: group.id })
    const [membership] = await t.db
      .insert(directMembership)
      .values({
        userId: member.id,
        groupId: webTeam.id,
        startDate: today,
        endDate: organisationYearPeriod(organisationYear).endDate
      })
      .returning({ id: directMembership.id })
    expect((await (await memberInfo()).json())[websiteAdminClaim]).toBe(true)

    await t.db.delete(directMembership).where(eq(directMembership.id, membership.id))
    expect((await (await memberInfo()).json())[websiteAdminClaim]).toBeUndefined()
    await t.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, admin.id))
    const inactive = await adminInfo()
    if (inactive.ok) expect((await inactive.json())[websiteAdminClaim]).toBeUndefined()
    else expect(inactive.status).toBe(401)
  })
})
