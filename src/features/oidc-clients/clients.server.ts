import "server-only"

import { headers } from "next/headers"
import { z } from "zod"
import { auth } from "@/core/auth"
import { identityScopes, websiteScope } from "@/core/auth/website-access"
import { requirePermission } from "@/core/authz"

const clientId = z.string().min(1)
const details = z.object({
  name: z.string().trim().min(1).max(200),
  redirectUrls: z.array(z.url()).min(1).max(20),
  websiteAccess: z.boolean().optional()
})
const commandSchema = z.discriminatedUnion("action", [
  details.extend({ action: z.literal("create") }),
  details.extend({ action: z.literal("edit"), clientId }),
  z.object({ action: z.literal("rotate"), clientId }),
  z.object({ action: z.literal("disable"), clientId, disabled: z.boolean() })
])

export type ClientCommand = z.infer<typeof commandSchema>
export type OidcClient = {
  id: string
  name: string
  redirectUrls: string[]
  disabled: boolean
  websiteAccess: boolean
}

function clientScope(scopes: string[], websiteAccess: boolean) {
  const allowed = scopes.filter((scope) => scope !== websiteScope)
  if (websiteAccess) allowed.push(websiteScope)
  return allowed.join(" ")
}

export async function listOidcClients(): Promise<OidcClient[]> {
  await requirePermission({ action: "oidcClient.manage" })
  const clients = await auth.api.getOAuthClients({ headers: await headers() })
  return (clients ?? []).map((client) => ({
    id: client.client_id,
    name: client.client_name ?? client.client_id,
    redirectUrls: client.redirect_uris ?? [],
    disabled: client.disabled ?? false,
    websiteAccess: client.scope?.split(" ").includes(websiteScope) ?? false
  }))
}

/** Validates a narrow v1 operation; secrets leave the provider only on create/rotate. */
export async function manageOidcClient(input: ClientCommand) {
  await requirePermission({ action: "oidcClient.manage" })
  const command = commandSchema.parse(input)
  const requestHeaders = await headers()
  if (command.action === "create") {
    const client = await auth.api.adminCreateOAuthClient({
      headers: requestHeaders,
      body: {
        client_name: command.name,
        redirect_uris: command.redirectUrls,
        application_type: "web",
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: clientScope(identityScopes, command.websiteAccess ?? false),
        require_pkce: true,
        skip_consent: true
      }
    })
    return { clientId: client.client_id, secret: client.client_secret }
  }
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

  let scope: string | undefined
  if (command.websiteAccess !== undefined) {
    const client = await auth.api.getOAuthClient({
      headers: requestHeaders,
      query: { client_id: command.clientId }
    })
    scope = clientScope(client.scope?.split(" ") ?? identityScopes, command.websiteAccess)
  }
  await auth.api.adminUpdateOAuthClient({
    headers: requestHeaders,
    body: {
      client_id: command.clientId,
      update: { client_name: command.name, redirect_uris: command.redirectUrls, scope }
    }
  })
  return undefined
}
