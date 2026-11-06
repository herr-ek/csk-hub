import "server-only"

import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { getAuthorizationQuery } from "./continuation"

/** Verify signature and expiry before displaying consent. Use the current provider secret;
 * callers must separately resolve the client with the current request's session.
 */
export async function getVerifiedConsentQuery(search: string, secret: string) {
  const oauthQuery = getAuthorizationQuery(search)
  if (!oauthQuery || !(await verifyOAuthQueryParams(oauthQuery, secret))) return null
  const params = new URLSearchParams(oauthQuery)
  const clientId = params.get("client_id")
  if (!clientId) return null
  return { oauthQuery, clientId, scopes: (params.get("scope") ?? "").split(" ").filter(Boolean) }
}
