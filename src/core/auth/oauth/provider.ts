import { oauthProvider } from "@better-auth/oauth-provider"
import { eq } from "drizzle-orm"
import { evaluatePermission } from "@/core/authz/policy-registry"
import type { Database } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { hasAdminRole } from "@/shared/roles"
import { bookieAccessRoles } from "./bookie-access"
import { type ClaimGroupId, claimGroups, type OAuthCatalogue, oauthCatalogue, providerScopes } from "./catalogue"
import { readClaimSettings } from "./client-claims"
import { websiteAccessRoles } from "./website-access"

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

const claimGroupRoles: Record<ClaimGroupId, (database: Database, userId: string) => Promise<string[]>> = {
  "website-access": websiteAccessRoles,
  "bookie-access": bookieAccessRoles
}

/**
 * Configures Hub-owned clients, using fresh roles rather than cached session claims. The catalogue
 * defaults to the real one; tests inject entries to exercise `user:` and `api:` grants.
 */
export function createOAuthProvider(
  database: Database,
  allowLocalCallbacks: boolean,
  catalogue: OAuthCatalogue = oauthCatalogue
) {
  return oauthProvider({
    loginPage: "/login",
    consentPage: "/oauth/consent",
    scopes: providerScopes(catalogue),
    async customUserInfoClaims({ user, jwt }) {
      const clientId = jwt.client_id
      if (!user || typeof clientId !== "string") return {}

      // Release rule: the client is enabled, has the group on, and the User qualifies for it.
      const client = await readClaimSettings(database, clientId)
      if (!client || client.disabled) return {}

      const claims: Record<string, string[]> = {}
      for (const group of claimGroups) {
        if (!client.releasedClaims.includes(group.id)) continue
        const roles = await claimGroupRoles[group.id](database, user.id)
        if (roles.length > 0) claims[group.claim] = roles
      }
      return claims
    },
    grantTypes: ["authorization_code", "client_credentials"],
    clientReference: () => "csk-hub",
    async clientPrivileges({ action, session }) {
      if (!session || action === "delete") return false
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
