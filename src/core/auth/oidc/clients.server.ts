import "server-only"

import { APIError } from "better-auth/api"
import { z } from "zod"
import type { auth } from "../auth"

const callbacks = z.array(z.url()).min(1).max(10)
const registration = z
  .object({
    client_name: z.string().min(1).max(100),
    redirect_uris: callbacks,
    scope: z.enum(["openid", "openid profile"]).optional(),
    skip_consent: z.boolean().optional()
  })
  .strict()
const update = z
  .object({
    client_id: z.string().min(1),
    update: registration.partial().extend({ disabled: z.boolean().optional() })
  })
  .strict()

/** Browser administration transport. Provider privilege hooks also protect direct server API calls. */
export function createOidcClientHandler(provider: {
  api: Pick<
    typeof auth.api,
    "getOAuthClients" | "adminCreateOAuthClient" | "adminUpdateOAuthClient" | "rotateClientSecret"
  >
}) {
  return async function handleOidcClients(request: Request): Promise<Response> {
    const headers = request.headers
    if (request.method !== "GET" && headers.get("origin") !== new URL(request.url).origin) {
      return Response.json({ error: "invalid_origin" }, { status: 403 })
    }
    try {
      let result: unknown
      if (request.method === "GET") {
        result = await provider.api.getOAuthClients({ headers })
      } else if (request.method === "POST" && !new URL(request.url).pathname.endsWith("/rotate-secret")) {
        result = await provider.api.adminCreateOAuthClient({
          headers,
          body: {
            scope: "openid profile",
            skip_consent: false,
            ...registration.parse(await request.json())
          }
        })
      } else if (request.method === "PATCH") {
        result = await provider.api.adminUpdateOAuthClient({ headers, body: update.parse(await request.json()) })
      } else {
        const body = z
          .object({ client_id: z.string().min(1) })
          .strict()
          .parse(await request.json())
        result = await provider.api.rotateClientSecret({ headers, body })
      }
      return Response.json(result, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
      if (error instanceof APIError)
        return Response.json({ error: "client_management_denied" }, { status: error.statusCode })
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return Response.json({ error: "invalid_request" }, { status: 400 })
      throw error
    }
  }
}
