import "server-only"

import type { AuthContext } from "@better-auth/core"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api"
import type { account, session, user } from "@/core/db/schema/auth"
import { hasAdminRole } from "@/shared/roles"

/**
 * Hub's account, session and administration checks. Register `plugin` before the OAuth
 * provider and connect the named callbacks below. Initialization uses that auth instance's
 * configured adapter; each factory call belongs to one auth instance.
 */
export function createHubOidcPolicy() {
  let context: AuthContext

  async function currentUser(userId: string) {
    const current = await context.adapter.findOne<typeof user.$inferSelect>({
      model: "user",
      where: [{ field: "id", value: userId }]
    })
    if (!current || current.banned) throw new APIError("FORBIDDEN", { error: "access_denied" })
    return current
  }

  async function currentSession(sessionId: string, userId: string, error = "login_required") {
    const stored = await context.adapter.findOne<typeof session.$inferSelect>({
      model: "session",
      where: [
        { field: "id", value: sessionId },
        { field: "userId", value: userId }
      ]
    })
    if (!stored || stored.expiresAt <= new Date() || stored.impersonatedBy) {
      throw new APIError("UNAUTHORIZED", { error })
    }
    return stored
  }

  async function activeAdmin({ session, user }: { session?: { id: string }; user?: { id: string } }) {
    if (!session || !user) return false
    try {
      await currentSession(session.id, user.id)
      return hasAdminRole((await currentUser(user.id)).role)
    } catch (error) {
      if (error instanceof APIError) return false
      throw error
    }
  }

  async function requiresActivation({
    user,
    session
  }: {
    user: { id: string }
    session: { id: string; impersonatedBy?: unknown }
  }) {
    if (session.impersonatedBy) throw new APIError("FORBIDDEN", { error: "access_denied" })
    await currentUser(user.id)
    await currentSession(session.id, user.id)
    const accounts = await context.adapter.findMany<typeof account.$inferSelect>({
      model: "account",
      where: [
        { field: "userId", value: user.id },
        { field: "providerId", value: "credential" }
      ]
    })
    return !accounts.some((account) => typeof account.password === "string")
  }

  async function checkTokenUser({ user }: { user?: { id: string } | null }) {
    if (!user) throw new APIError("FORBIDDEN", { error: "access_denied" })
    await currentUser(user.id)
    return {}
  }

  async function checkUserInfo({ user, jwt }: { user: { id: string }; jwt: Record<string, unknown> }) {
    await currentUser(user.id)
    if (typeof jwt.sid !== "string") throw new APIError("UNAUTHORIZED", { error: "invalid_token" })
    await currentSession(jwt.sid, user.id, "invalid_token")
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
              await currentUser(fresh.user.id)
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
