import "server-only"

import { oauthProvider } from "@better-auth/oauth-provider"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api"
import { jwt } from "better-auth/plugins"
import { and, eq, gt, isNotNull } from "drizzle-orm"
import type { db } from "@/core/db"
import { account, session, user } from "@/core/db/schema/auth"
import { hasAdminRole } from "@/shared/roles"

type ProviderOptions = {
  database: typeof db
  issuer: string
  environment: "development" | "test" | "preview" | "production"
}

/**
 * Persistent, confidential authorization-code provider. Management privileges are resolved
 * from current database facts, including for the provider's server-only administration APIs.
 * The issuer must be the deployment's explicit auth base URL including /api/auth.
 */
export function createOidcPlugins({ database, issuer, environment }: ProviderOptions) {
  const url = new URL(issuer)
  if (
    url.pathname !== "/api/auth" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (environment !== "development" && environment !== "test" && url.protocol !== "https:")
  ) {
    throw new Error("OIDC issuer must be an explicit deployment URL ending in /api/auth")
  }

  async function currentUser(userId: string) {
    const [current] = await database.select().from(user).where(eq(user.id, userId))
    if (!current || current.banned) throw new APIError("FORBIDDEN", { error: "access_denied" })
    return current
  }

  async function activeAdmin(context: { session?: { id: string }; user?: { id: string } }) {
    if (!context.session || !context.user) return false
    const [row] = await database
      .select({ role: user.role, banned: user.banned, impersonatedBy: session.impersonatedBy })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(and(eq(session.id, context.session.id), eq(user.id, context.user.id), gt(session.expiresAt, new Date())))
    return !!row && !row.banned && !row.impersonatedBy && hasAdminRole(row.role)
  }

  const authority = {
    id: "oidc-authority",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/magic-link" && !!ctx.body?.oauth_query,
          handler: createAuthMiddleware(async (ctx) => {
            const callback = `${url.origin}/api/oidc/resume?${ctx.body.oauth_query}`
            ctx.body.callbackURL = callback
            ctx.body.newUserCallbackURL = callback
          })
        },
        {
          matcher: (ctx) => !!(ctx.path?.startsWith("/oauth2/") || ctx.path?.startsWith("/admin/oauth2/")),
          handler: createAuthMiddleware(async (ctx) => {
            const created = ctx.context.newSession
            const fresh = created
              ? await ctx.context.internalAdapter.findSession(created.session.token)
              : await getAuthoritativeSessionFromCtx(ctx)
            const cookie = ctx.headers?.get("cookie") ?? ""
            if (
              !fresh &&
              (cookie.includes(`${ctx.context.authCookies.sessionToken.name}=`) ||
                cookie.includes(`${ctx.context.authCookies.sessionData.name}=`))
            ) {
              throw new APIError("UNAUTHORIZED", { error: "login_required" })
            }
            if (fresh) {
              await currentUser(fresh.user.id)
              if (fresh.session.impersonatedBy) throw new APIError("FORBIDDEN", { error: "access_denied" })
            }
            ctx.context.session = fresh
          })
        }
      ]
    }
  } satisfies BetterAuthPlugin

  return [
    authority,
    jwt({
      jwt: { issuer },
      jwks: { keyPairConfig: { alg: "RS256" }, rotationInterval: 60 * 60 * 24 * 30, gracePeriod: 60 * 60 * 24 },
      disableSettingJwtHeader: true
    }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oidc/consent",
      scopes: ["openid", "profile"],
      grantTypes: ["authorization_code"],
      validateRedirectUri: (redirectUri, registered) => {
        const callback = new URL(redirectUri)
        const local = environment === "development" || environment === "test"
        return (
          registered.includes(redirectUri) &&
          (callback.protocol === "https:" ||
            (local && callback.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname)))
        )
      },
      signup: {
        page: "/activate",
        shouldRedirect: async ({ user: identity, session: originating }) => {
          if (originating.impersonatedBy) throw new APIError("FORBIDDEN", { error: "access_denied" })
          await currentUser(identity.id)
          const [activeSession] = await database
            .select({ id: session.id })
            .from(session)
            .where(
              and(eq(session.id, originating.id), eq(session.userId, identity.id), gt(session.expiresAt, new Date()))
            )
          if (!activeSession) throw new APIError("UNAUTHORIZED", { error: "login_required" })
          const [credential] = await database
            .select({ id: account.id })
            .from(account)
            .where(
              and(eq(account.userId, identity.id), eq(account.providerId, "credential"), isNotNull(account.password))
            )
          return !credential
        }
      },
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      clientPrivileges: activeAdmin,
      resourcePrivileges: activeAdmin,
      customAccessTokenClaims: async ({ user: identity }) => {
        if (!identity) throw new APIError("FORBIDDEN", { error: "access_denied" })
        await currentUser(identity.id)
        return {}
      },
      customIdTokenClaims: async ({ user: identity }) => {
        await currentUser(identity.id)
        return {}
      },
      customUserInfoClaims: async ({ user: identity, jwt: token }) => {
        await currentUser(identity.id)
        if (typeof token.sid !== "string") throw new APIError("UNAUTHORIZED", { error: "invalid_token" })
        const [originating] = await database
          .select()
          .from(session)
          .where(and(eq(session.id, token.sid), eq(session.userId, identity.id), gt(session.expiresAt, new Date())))
        if (!originating || originating.impersonatedBy) throw new APIError("UNAUTHORIZED", { error: "invalid_token" })
        return {}
      }
    })
  ] as const
}
