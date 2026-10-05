import "server-only"

import { io } from "next/cache"
import { headers } from "next/headers"
import { cache } from "react"
import { auth } from "./auth"

export const AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"

/** Thrown when a server workflow requires a signed-in user. */
export class AuthenticationRequiredError extends Error {
  readonly code = AUTHENTICATION_REQUIRED

  constructor() {
    super("The current request has no authenticated user.")
    this.name = "AuthenticationRequiredError"
  }
}

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

/** Returns the signed-in user's ID for server-side workflows. */
export async function requireAuthenticatedUser(): Promise<string> {
  const session = await getRequestSession()

  if (!session) throw new AuthenticationRequiredError()

  return session.user.id
}
