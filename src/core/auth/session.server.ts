import "server-only"

import { io } from "next/cache"
import { headers } from "next/headers"
import { cache } from "react"
import { auth } from "./auth"

/**
 * Reads the request session outside prerendering so Better Auth can check expiry
 * against the current time. Rendering callers need an enclosing Suspense boundary.
 * React cache shares a read-only session snapshot within a render, not across requests.
 * Keep this outside Next.js "use cache" scopes: io() does not suspend inside them.
 */
export const getRequestSession = cache(async () => {
  // Headers can resolve during runtime prerender; session expiry still needs the current time.
  await io()
  return auth.api.getSession({ headers: await headers() })
})

/**
 * Validates the request against the stored session, bypassing Better Auth's cookie cache.
 * Authorization calls this afresh for each operation; it is not React-cached. Rendering callers
 * still need Suspense and must stay outside cache scopes. Callers must also check current User
 * status: Better Auth does not reject an existing session solely because its User is banned.
 */
export async function getFreshRequestSession() {
  await io()
  // Validation must remain read-only when a caller already holds a Session lock.
  return auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true, disableRefresh: true } })
}
