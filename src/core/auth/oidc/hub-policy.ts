import "server-only"

import type { AuthContext } from "@better-auth/core"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api"
import type { account, session } from "@/core/db/schema/auth"
import { hasAdminRole } from "@/shared/roles"

/**
 * Hub's account, session and administration checks. Register `plugin` before the OAuth
 * provider and connect the named callbacks below. Initialization uses that auth instance's
 * configured adapter; each factory call belongs to one auth instance.
 */
export function createHubOidcPolicy() {
  let context: AuthContext

  function checkActiveUser(user: { id: string; banned?: unknown } | null | undefined) {
    if (!user || user.banned) throw new APIError("FORBIDDEN", { error: "access_denied" })
    return {}
  }

  // The before hook below replaces cached session data before these privilege callbacks run.
  function activeAdmin({
    session,
    user
  }: {
    session?: { id: string; impersonatedBy?: unknown }
    user?: { id: string; role?: unknown; banned?: unknown }
  }) {
    return !!session && !!user && !session.impersonatedBy && !user.banned && hasAdminRole(user.role)
  }

  async function requiresActivation({ user }: { user: { id: string } }) {
    const accounts = await context.adapter.findMany<typeof account.$inferSelect>({
      model: "account",
      where: [
        { field: "userId", value: user.id },
        { field: "providerId", value: "credential" }
      ]
    })
    return !accounts.some((account) => typeof account.password === "string")
  }

  // Better Auth reloads the User before issuing or validating opaque tokens.
  function checkTokenUser({ user }: { user?: { id: string; banned?: unknown } | null }) {
    return checkActiveUser(user)
  }

  async function checkUserInfo({ jwt }: { jwt: Record<string, unknown> }) {
    if (typeof jwt.sid !== "string") throw new APIError("UNAUTHORIZED", { error: "invalid_token" })
    // Token validation already checks session existence and expiry; Hub additionally forbids impersonation.
    const originating = await context.adapter.findOne<typeof session.$inferSelect>({
      model: "session",
      where: [{ field: "id", value: jwt.sid }]
    })
    if (originating?.impersonatedBy) throw new APIError("FORBIDDEN", { error: "access_denied" })
    return {}
  }

  const plugin = {
    id: "oidc-authority",
    init(ctx) {
      context = ctx
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/magic-link" && !!ctx.body?.oauth_query,
          handler: createAuthMiddleware(async (ctx) => {
            const callback = `${new URL(ctx.context.baseURL).origin}/api/oidc/resume?${ctx.body.oauth_query}`
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
              checkActiveUser(fresh.user)
              if (fresh.session.impersonatedBy) throw new APIError("FORBIDDEN", { error: "access_denied" })
            }
            ctx.context.session = fresh
          })
        }
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/oauth2/client/rotate-secret",
          handler: createAuthMiddleware(async (ctx) => {
            const result = ctx.context.returned
            if (
              result &&
              typeof result === "object" &&
              "client_secret" in result &&
              typeof ctx.body?.client_id === "string"
            ) {
              await context.adapter.updateMany({
                model: "oauthAccessToken",
                where: [{ field: "clientId", value: ctx.body.client_id }],
                update: { revoked: new Date() }
              })
            }
          })
        }
      ]
    }
  } satisfies BetterAuthPlugin

  return { plugin, activeAdmin, requiresActivation, checkTokenUser, checkUserInfo }
}
