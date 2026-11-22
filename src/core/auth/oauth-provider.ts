import { oauthProvider } from "@better-auth/oauth-provider"
import { eq } from "drizzle-orm"
import { evaluatePermission } from "@/core/authz/policy-registry"
import type { Database } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { hasAdminRole } from "@/shared/roles"
import { oidcScopes, websiteScope } from "./oidc-scopes"
import { canAccessWebsiteAdmin, websiteAdminClaim } from "./website-access"

// Management is exposed only through validated, Admin-only Server Actions. Direct server API
// calls still work; blocking these HTTP paths prevents arbitrary client metadata mutations.
export const oauthDisabledPaths = [
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/delete-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/get-client",
  "/oauth2/get-clients"
]

/** Configures Hub-owned confidential clients, using fresh roles rather than cached session claims. */
export function createOAuthProvider(database: Database, allowLocalCallbacks: boolean) {
  return oauthProvider({
    loginPage: "/login",
    consentPage: "/oauth/consent",
    scopes: [...oidcScopes],
    async customUserInfoClaims({ user, scopes, jwt }) {
      const clientId = jwt.client_id
      if (!user || typeof clientId !== "string" || !scopes.includes(websiteScope)) return {}

      return (await canAccessWebsiteAdmin(database, user.id, clientId)) ? { [websiteAdminClaim]: true } : {}
    },
    grantTypes: ["authorization_code"],
    clientReference: () => "csk-hub",
    async clientPrivileges({ action, session }) {
      if (!session || action === "delete" || action === "configure-client-credentials-scopes") return false
      const [actor] = await database
        .select({ id: user.id, role: user.role, banned: user.banned })
        .from(user)
        .where(eq(user.id, session.userId))
      return evaluatePermission(
        actor && !actor.banned ? { userId: actor.id, isAdmin: hasAdminRole(actor.role) } : null,
        { action: "oidcClient.manage" }
      )
    },
    allowInsecureRedirectUri: (url) => allowLocalCallbacks && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  })
}
