import { afterAll, describe, expect, test } from "bun:test"
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { betterAuth } from "better-auth"
import { admin, jwt } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import * as schema from "@/core/db/schema/auth"
import { choir, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import {
  cskToday,
  currentOrganisationYear,
  GroupType,
  organisationYearPeriod,
  PositionCode
} from "@/core/org-structure"
import { createTestDatabase } from "../../../../test/database"
import { createAuthPlugins } from "../auth-plugins"
import { type ClaimGroupId, claimGroups, type OAuthCatalogue, signInScope } from "./catalogue"
import { readClaimSettings, readClientMetadata, withReleasedClaims } from "./client-claims"
import { getOAuthResumePath } from "./continuation"
import { createOAuthProvider, oauthDisabledPaths } from "./provider"

const database = await createTestDatabase()

function claimName(id: ClaimGroupId): string {
  const group = claimGroups.find((entry) => entry.id === id)
  if (!group) throw new Error(`Unknown claim group ${id}`)
  return group.claim
}

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

  async function register(headers: Headers, options: { scope?: string; metadata?: Record<string, unknown> } = {}) {
    return auth.api.adminCreateOAuthClient({
      headers,
      body: {
        client_name: "Test app",
        redirect_uris: ["http://localhost:8787/callback"],
        application_type: "web",
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: options.scope ?? "openid profile email",
        require_pkce: true,
        skip_consent: true,
        metadata: options.metadata ?? withReleasedClaims({}, [])
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

  /** Signs the User in through the client and returns the access token for the requested scope. */
  async function accessToken(clientId: string, secret: string, subject: { cookie: string }, scope: string) {
    const response = await request(authorization(clientId, { scope }), undefined, subject.cookie)
    const code = new URL(response.headers.get("location") as string).searchParams.get("code") as string
    const token = await exchange(clientId, secret, code)
    expect(token.status).toBe(200)
    return (await token.json()).access_token as string
  }

  async function userInfo(token: string) {
    return request("/oauth2/userinfo", undefined, "", `Bearer ${token}`)
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
      grant_types_supported: ["authorization_code", "client_credentials"],
      scopes_supported: [signInScope, "profile", "email"]
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
    const userInfoResponse = await auth.handler(
      new Request(`${origin}/api/auth/oauth2/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } })
    )
    expect(await userInfoResponse.json()).toMatchObject({ sub: member.id, email: member.email })

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

  test("website-access claim is released only to qualifying Users of an enabled, enabled-client", async () => {
    const admin = await account("admin")
    const member = await account("user")
    const outsider = await account("user")
    const website = claimName("website-access")
    const enabled = await register(admin.headers, { metadata: withReleasedClaims({}, ["website-access"]) })
    const notEnabled = await register(admin.headers)
    const scope = "openid profile"

    const adminToken = await accessToken(enabled.client_id, enabled.client_secret as string, admin, scope)
    const adminInfo = await (await userInfo(adminToken)).json()
    expect(adminInfo[website]).toEqual(["admin"])
    expect(adminInfo[claimName("bookie-access")]).toBeUndefined()

    const outsiderToken = await accessToken(enabled.client_id, enabled.client_secret as string, outsider, scope)
    expect((await (await userInfo(outsiderToken)).json())[website]).toBeUndefined()

    const notEnabledToken = await accessToken(notEnabled.client_id, notEnabled.client_secret as string, admin, scope)
    expect((await (await userInfo(notEnabledToken)).json())[website]).toBeUndefined()

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
    const memberToken = await accessToken(enabled.client_id, enabled.client_secret as string, member, scope)
    expect((await (await userInfo(memberToken)).json())[website]).toEqual(["admin"])

    await t.db.delete(directMembership).where(eq(directMembership.id, membership.id))
    const memberAgain = await accessToken(enabled.client_id, enabled.client_secret as string, member, scope)
    expect((await (await userInfo(memberAgain)).json())[website]).toBeUndefined()

    await auth.api.adminUpdateOAuthClient({
      headers: admin.headers,
      body: { client_id: enabled.client_id, update: { disabled: true } }
    })
    const disabledClient = await userInfo(adminToken)
    if (disabledClient.ok) expect((await disabledClient.json())[website]).toBeUndefined()
    else expect(disabledClient.status).toBe(401)
  })

  test("bookie-access claim is released to active Admins and current Konsertmästare only", async () => {
    const admin = await account("admin")
    const firstConcertMaster = await account("user")
    const choirConcertMaster = await account("user")
    const member = await account("user")
    const bookie = claimName("bookie-access")
    const scope = "openid profile"
    const enabled = await register(admin.headers, { metadata: withReleasedClaims({}, ["bookie-access"]) })
    const notEnabled = await register(admin.headers)

    const adminInfo = await (
      await userInfo(await accessToken(enabled.client_id, enabled.client_secret as string, admin, scope))
    ).json()
    expect(adminInfo[bookie]).toEqual(["organizer"])
    expect(adminInfo[claimName("website-access")]).toBeUndefined()
    expect(
      (
        await (
          await userInfo(await accessToken(notEnabled.client_id, notEnabled.client_secret as string, admin, scope))
        ).json()
      )[bookie]
    ).toBeUndefined()

    const today = cskToday()
    const year = currentOrganisationYear(today)
    const period = organisationYearPeriod(year)
    const [board] = await t.db.insert(group).values({ type: GroupType.Board, organisationYear: year }).returning()
    const [choirGroup] = await t.db.insert(group).values({ type: GroupType.Choir, name: "Bookie Choir" }).returning()
    await t.db.insert(choir).values({ groupId: choirGroup.id })
    await t.db.insert(positionAppointment).values([
      {
        userId: firstConcertMaster.id,
        contextGroupId: board.id,
        positionCode: PositionCode.FirstConcertMaster,
        organisationYear: year,
        ...period
      },
      {
        userId: choirConcertMaster.id,
        contextGroupId: choirGroup.id,
        positionCode: PositionCode.ChoirConcertMaster,
        organisationYear: year,
        ...period
      }
    ])
    const releasedTo = async (subject: { cookie: string }) =>
      (
        await (
          await userInfo(await accessToken(enabled.client_id, enabled.client_secret as string, subject, scope))
        ).json()
      )[bookie]
    expect(await releasedTo(firstConcertMaster)).toEqual(["organizer"])
    expect(await releasedTo(choirConcertMaster)).toEqual(["organizer"])
    expect(await releasedTo(member)).toBeUndefined()

    await t.db.delete(positionAppointment).where(eq(positionAppointment.userId, firstConcertMaster.id))
    expect(await releasedTo(firstConcertMaster)).toBeUndefined()
    await t.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, choirConcertMaster.id))
    const banned = await userInfo(
      await accessToken(enabled.client_id, enabled.client_secret as string, choirConcertMaster, scope)
    )
    expect(banned.ok ? (await banned.json())[bookie] : undefined).toBeUndefined()
  })

  test("editing claim settings keeps an unrelated metadata key", async () => {
    const owner = await account("admin")
    const created = await register(owner.headers, { metadata: { "internal-note": "keep" } })
    const id = created.client_id

    await auth.api.adminUpdateOAuthClient({
      headers: owner.headers,
      body: {
        client_id: id,
        update: { metadata: withReleasedClaims(await readClientMetadata(t.db, id), ["website-access"]) }
      }
    })

    const stored = await readClientMetadata(t.db, id)
    expect(stored).toMatchObject({ "internal-note": "keep" })
    expect((await readClaimSettings(t.db, id))?.releasedClaims).toEqual(["website-access"])
  })

  test("unknown claim group ids in stored metadata are ignored", async () => {
    const owner = await account("admin")
    const admin = await account("admin")
    const created = await register(owner.headers, {
      metadata: { csk: { releasedClaims: ["website-access", "retired-group"] } }
    })
    expect((await readClaimSettings(t.db, created.client_id))?.releasedClaims).toEqual(["website-access"])

    const malformed = await register(owner.headers, { metadata: { csk: { releasedClaims: "website-access" } } })
    expect((await readClaimSettings(t.db, malformed.client_id))?.releasedClaims).toEqual([])

    const token = await accessToken(created.client_id, created.client_secret as string, admin, "openid profile")
    expect((await (await userInfo(token)).json())[claimName("website-access")]).toEqual(["admin"])
  })

  test("API scopes are issued only through client_credentials and only when configured by an Admin", async () => {
    const owner = await account("admin")
    const member = await account("user")
    const catalogue: OAuthCatalogue = {
      userScopes: [{ scope: "user:test:read" }],
      apiScopes: [{ scope: "api:test:read" }]
    }
    const provider = betterAuth({
      ...auth.options,
      plugins: [admin(), jwt({ disableSettingJwtHeader: true }), createOAuthProvider(t.db, true, catalogue)]
    })
    const machineBody: {
      application_type: "web"
      token_endpoint_auth_method: "client_secret_basic"
      grant_types: ["client_credentials"]
    } = {
      application_type: "web",
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["client_credentials"]
    }

    const machine = await provider.api.adminCreateOAuthClient({
      headers: owner.headers,
      body: { ...machineBody, client_name: "Machine", scope: "", client_credentials_scopes: ["api:test:read"] }
    })
    // Null would let the client request every provider scope if sign-in were ever enabled.
    const [stored] = await t.db
      .select({ scopes: schema.oauthClient.scopes })
      .from(schema.oauthClient)
      .where(eq(schema.oauthClient.clientId, machine.client_id))
    expect(stored.scopes).not.toBeNull()

    const loginClient = await register(owner.headers, { scope: `${signInScope} profile` })
    for (const [id, error] of [
      [loginClient.client_id, "invalid_scope"],
      [machine.client_id, "unauthorized_client"]
    ]) {
      const refused = await provider.handler(
        new Request(`${origin}/api/auth${authorization(id, { scope: "openid api:test:read" })}`, {
          headers: { cookie: owner.cookie, accept: "text/html" }
        })
      )
      const location = new URL(refused.headers.get("location") as string)
      expect(location.searchParams.get("error")).toBe(error)
      expect(location.searchParams.has("code")).toBe(false)
    }

    async function clientCredentials(clientId: string, secret: string, scope: string) {
      return provider.handler(
        new Request(`${origin}/api/auth/oauth2/token`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`
          },
          body: new URLSearchParams({ grant_type: "client_credentials", scope })
        })
      )
    }
    const issued = await clientCredentials(machine.client_id, machine.client_secret as string, "api:test:read")
    expect(issued.status).toBe(200)
    expect((await issued.json()).scope).toBe("api:test:read")
    expect(
      (await clientCredentials(machine.client_id, machine.client_secret as string, "user:test:read")).status
    ).not.toBe(200)

    // The plugin accepts any provider scope here; keeping user: scopes off the machine side is the
    // server action's schema check (see client-command.test.ts).
    await expect(
      provider.api.adminCreateOAuthClient({
        headers: member.headers,
        body: { ...machineBody, client_name: "Member", client_credentials_scopes: ["api:test:read"] }
      })
    ).rejects.toThrow()

    // A sign-in client becomes a machine client through the same update the admin form sends.
    const signIn = await provider.api.adminCreateOAuthClient({
      headers: owner.headers,
      body: {
        client_name: "Converted",
        redirect_uris: ["http://localhost:8787/callback"],
        application_type: "web",
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: `${signInScope} profile`,
        require_pkce: true,
        skip_consent: true
      }
    })
    await provider.api.adminUpdateOAuthClient({
      headers: owner.headers,
      body: {
        client_id: signIn.client_id,
        update: {
          grant_types: ["client_credentials"],
          response_types: [],
          scope: "",
          client_credentials_scopes: ["api:test:read"]
        }
      }
    })
    const converted = await clientCredentials(signIn.client_id, signIn.client_secret as string, "api:test:read")
    expect(converted.status).toBe(200)
  })

  test("default catalogue advertises no user or API scopes", async () => {
    const discovery = await (await request("/.well-known/openid-configuration")).json()
    expect(discovery.scopes_supported).toEqual([signInScope, "profile", "email"])
  })
})
