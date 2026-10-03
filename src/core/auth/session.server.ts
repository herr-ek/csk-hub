import "server-only"

import { headers } from "next/headers"
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

/** Returns the signed-in user's ID for server-side workflows. */
export async function requireAuthenticatedUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) throw new AuthenticationRequiredError()

  return session.user.id
}
