import { describe, expect, test } from "bun:test"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { magicLink } from "better-auth/plugins"
import { getBaseURL } from "./base-url"

const deploymentHost = "csk-hub-abc123-team.vercel.app"
const branchHost = "csk-hub-git-auth-fix-team.vercel.app"
const productionOrigin = "https://choir.example.test"
const previewEnvironment = {
  ENVIRONMENT: "preview" as const,
  BETTER_AUTH_URL: productionOrigin,
  VERCEL_URL: deploymentHost,
  VERCEL_BRANCH_URL: branchHost
}

const scenarios = [
  {
    name: "production",
    environment: { ...previewEnvironment, ENVIRONMENT: "production" as const },
    origin: productionOrigin
  },
  { name: "preview deployment", environment: previewEnvironment, origin: `https://${deploymentHost}` },
  { name: "preview branch", environment: previewEnvironment, origin: `https://${branchHost}` },
  {
    name: "preview without branch alias",
    environment: { ...previewEnvironment, VERCEL_BRANCH_URL: undefined },
    origin: `https://${deploymentHost}`
  },
  {
    name: "development",
    environment: {
      ENVIRONMENT: "development" as const,
      BETTER_AUTH_URL: "http://localhost:3000"
    },
    origin: "http://localhost:3000"
  }
]

async function createFixture(environment: Parameters<typeof getBaseURL>[0], origin: string) {
  const sent = { resetURL: "", magicURL: "" }
  const auth = betterAuth({
    baseURL: getBaseURL(environment),
    secret: "auth-002-disposable-regression-test-secret",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    logger: { disabled: true },
    rateLimit: { enabled: false },
    // Better Auth otherwise skips origin checks by default in NODE_ENV=test.
    advanced: { disableOriginCheck: false },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ url }) => {
        sent.resetURL = url
      }
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        sendMagicLink: async ({ url }) => {
          sent.magicURL = url
        }
      })
    ]
  })
  const context = await auth.$context
  await context.internalAdapter.createUser(
    { email: "member@example.test", name: "Test member", emailVerified: true },
    { method: "admin" }
  )

  const post = (path: string, body: object, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ email: "member@example.test", ...body })
      })
    )

  return { auth, context, sent, post }
}

describe("auth base URL", () => {
  test("requires the deployment hostname in previews", () => {
    expect(() => getBaseURL({ ENVIRONMENT: "preview", BETTER_AUTH_URL: productionOrigin })).toThrow(
      "VERCEL_URL is required for preview deployments"
    )
  })

  for (const { name, environment, origin } of scenarios) {
    describe(name, () => {
      test("rejects unrelated callbacks before issuing email links", async () => {
        const { post, sent } = await createFixture(environment, origin)
        const callbacks = [
          "https://unrelated-review-tenant.vercel.app/collect",
          `https://${deploymentHost}.attacker.example/collect`,
          `https://${deploymentHost}@unrelated-review-tenant.vercel.app/collect`,
          "//unrelated-review-tenant.vercel.app/collect"
        ]

        for (const callback of callbacks) {
          expect((await post("/request-password-reset", { redirectTo: callback })).status).toBe(403)
          for (const field of ["callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
            expect((await post("/sign-in/magic-link", { [field]: callback })).status).toBe(403)
          }
        }
        expect(sent).toEqual({ resetURL: "", magicURL: "" })
      })

      test("preserves local and exact-origin callbacks and rejects tampered verification links", async () => {
        const { auth, post, sent } = await createFixture(environment, origin)

        for (const prefix of ["", origin]) {
          expect((await post("/request-password-reset", { redirectTo: `${prefix}/reset-password` })).status).toBe(200)
          const resetURL = new URL(sent.resetURL)
          expect(resetURL.origin).toBe(origin)

          resetURL.searchParams.set("callbackURL", "https://unrelated-review-tenant.vercel.app/collect")
          const blockedReset = await auth.handler(new Request(resetURL))
          expect(blockedReset.status).toBe(403)
          expect(blockedReset.headers.get("location")).toBeNull()

          const reset = await auth.handler(new Request(sent.resetURL))
          expect(reset.status).toBe(302)
          const resetDestination = new URL(reset.headers.get("location") ?? "")
          expect(resetDestination.origin).toBe(origin)
          expect(resetDestination.pathname).toBe("/reset-password")
          expect(resetDestination.searchParams.get("token")).toBeTruthy()

          expect((await post("/sign-in/magic-link", { callbackURL: `${prefix}/activate` })).status).toBe(200)
          const magicURL = new URL(sent.magicURL)
          expect(magicURL.origin).toBe(origin)
          magicURL.searchParams.set("callbackURL", "https://unrelated-review-tenant.vercel.app/collect")
          const blockedMagic = await auth.handler(new Request(magicURL))
          expect(blockedMagic.status).toBe(403)
          expect(blockedMagic.headers.get("location")).toBeNull()

          const activation = await auth.handler(new Request(sent.magicURL))
          expect(activation.status).toBe(302)
          expect(activation.headers.get("location")).toBe(`${origin}/activate`)
          expect(activation.headers.get("set-cookie")).toContain("session_token")
        }
      })

      test("enforces auth request origins and excludes other environments", async () => {
        const { post, context } = await createFixture(environment, origin)
        expect(context.isTrustedOrigin(origin)).toBe(true)
        expect(context.isTrustedOrigin("https://unrelated-review-tenant.vercel.app")).toBe(false)
        if (environment.ENVIRONMENT === "preview") {
          expect(context.isTrustedOrigin(productionOrigin)).toBe(false)
          expect(context.isTrustedOrigin(`http://${deploymentHost}`)).toBe(false)
        } else {
          expect(context.isTrustedOrigin(`https://${deploymentHost}`)).toBe(false)
        }
        const allowed = await post(
          "/request-password-reset",
          { redirectTo: "/reset-password" },
          {
            origin,
            cookie: "auth-origin-test=1"
          }
        )
        expect(allowed.status).toBe(200)
        const blocked = await post(
          "/request-password-reset",
          { redirectTo: "/reset-password" },
          {
            origin: "https://unrelated-review-tenant.vercel.app",
            cookie: "auth-origin-test=1"
          }
        )
        expect(blocked.status).toBe(403)
      })
    })
  }
})
