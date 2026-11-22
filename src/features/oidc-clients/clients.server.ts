import "server-only"

import { headers } from "next/headers"
import type { z } from "zod"
import { auth } from "@/core/auth"
import { readClientMetadata, readReleasedClaimsByClient, withReleasedClaims } from "@/core/auth/client-claims"
import { type ClaimGroupId, oauthCatalogue, signInScope, standardLoginScopes } from "@/core/auth/oauth-catalogue"
import { requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { oauthClient } from "@/core/db/schema/auth"
import { createClientCommandSchema } from "./client-command"

const commandSchema = createClientCommandSchema(oauthCatalogue)

export type ClientCommand = z.infer<typeof commandSchema>
export type OidcClient = {
  id: string
  name: string
  redirectUrls: string[]
  disabled: boolean
  /** Whether users can sign in through this client, which is the `authorization_code` grant. */
  signIn: boolean
  /** Login scopes ticked for sign-in: `profile`, `email` and any `user:` entries. */
  scopes: string[]
  claimGroups: ClaimGroupId[]
  /** Machine access scopes, the `api:` entries. */
  clientCredentialsScopes: string[]
}

export async function listOidcClients(): Promise<OidcClient[]> {
  await requirePermission({ action: "oidcClient.manage" })
  const [clients, releasedClaims, apiScopeRows] = await Promise.all([
    auth.api.getOAuthClients({ headers: await headers() }),
    readReleasedClaimsByClient(db),
    db.select({ clientId: oauthClient.clientId, scopes: oauthClient.clientCredentialsScopes }).from(oauthClient)
  ])
  const storedApiScopes = new Map(apiScopeRows.map((row) => [row.clientId, row.scopes ?? []]))
  const loginScopes: readonly string[] = [
    ...standardLoginScopes,
    ...oauthCatalogue.userScopes.map((entry) => entry.scope)
  ]
  const apiScopes: readonly string[] = oauthCatalogue.apiScopes.map((entry) => entry.scope)
  return (clients ?? []).map((client) => {
    const storedScopes = client.scope?.split(" ") ?? []
    const clientApiScopes: readonly string[] = storedApiScopes.get(client.client_id) ?? []
    return {
      id: client.client_id,
      name: client.client_name ?? client.client_id,
      redirectUrls: client.redirect_uris ?? [],
      disabled: client.disabled ?? false,
      signIn: client.grant_types?.includes("authorization_code") ?? false,
      scopes: storedScopes.filter((scope) => loginScopes.includes(scope)),
      claimGroups: releasedClaims.get(client.client_id) ?? [],
      clientCredentialsScopes: clientApiScopes.filter((scope) => apiScopes.includes(scope))
    }
  })
}

/** Validates a narrow v1 operation; secrets leave the provider only on create/rotate. */
export async function manageOidcClient(input: ClientCommand) {
  await requirePermission({ action: "oidcClient.manage" })
  const command = commandSchema.parse(input)
  const requestHeaders = await headers()
  if (command.action === "rotate") {
    const client = await auth.api.rotateClientSecret({ headers: requestHeaders, body: { client_id: command.clientId } })
    return { clientId: client.client_id, secret: client.client_secret }
  }
  if (command.action === "disable") {
    await auth.api.adminUpdateOAuthClient({
      headers: requestHeaders,
      body: { client_id: command.clientId, update: { disabled: command.disabled } }
    })
    return
  }

  const grantTypes = [
    ...(command.signIn ? ["authorization_code"] : []),
    ...(command.clientCredentialsScopes.length > 0 ? ["client_credentials"] : [])
  ]
  const scope = command.signIn ? [signInScope, ...command.scopes].join(" ") : undefined
  const releasedClaims = command.signIn ? command.claimGroups : []
  const sharedSettings = {
    client_name: command.name,
    redirect_uris: command.signIn ? command.redirectUrls : undefined,
    grant_types: grantTypes,
    client_credentials_scopes: command.clientCredentialsScopes,
    require_pkce: command.signIn ? true : undefined,
    skip_consent: command.signIn ? true : undefined
  }

  if (command.action === "create") {
    const client = await auth.api.adminCreateOAuthClient({
      headers: requestHeaders,
      body: {
        ...sharedSettings,
        application_type: "web",
        token_endpoint_auth_method: "client_secret_basic",
        response_types: command.signIn ? ["code"] : undefined,
        scope,
        metadata: withReleasedClaims({}, releasedClaims)
      }
    })
    return { clientId: client.client_id, secret: client.client_secret }
  }

  // The plugin replaces the whole metadata object on update, so the current one is merged here.
  const current = await readClientMetadata(db, command.clientId)
  if (current === undefined) throw new Error("OIDC client not found")
  await auth.api.adminUpdateOAuthClient({
    headers: requestHeaders,
    body: {
      client_id: command.clientId,
      update: {
        ...sharedSettings,
        // The plugin cannot store an empty redirect list, so redirect URIs are left as stored when
        // sign-in is off. Without the authorization_code grant they are not used.
        redirect_uris: command.signIn ? command.redirectUrls : undefined,
        scope: scope ?? "",
        response_types: command.signIn ? ["code"] : [],
        metadata: withReleasedClaims(current, releasedClaims)
      }
    }
  })
  return undefined
}
