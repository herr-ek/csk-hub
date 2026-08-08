import { auth } from "@/lib/auth";
import { isAdminRole } from "./roles";

export type AuthorizationFailure = "unauthenticated" | "not-admin";

/**
 * Thrown by the guards instead of ending the response, so the same helper works
 * from a route handler (map `status` onto a `Response`) and from a server
 * component (catch it and redirect, or let the error boundary take it).
 */
export class AuthorizationError extends Error {
  readonly reason: AuthorizationFailure;

  constructor(reason: AuthorizationFailure) {
    super(
      reason === "unauthenticated"
        ? "Not signed in"
        : "This action is reserved for Admins",
    );
    this.name = "AuthorizationError";
    this.reason = reason;
  }

  get status(): 401 | 403 {
    return this.reason === "unauthenticated" ? 401 : 403;
  }
}

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * Falls back to the ambient request headers when none are passed, which is what
 * a server component or route handler wants. The import is deferred so that
 * callers outside a Next.js request — scripts, tests — never load it.
 */
async function resolveHeaders(requestHeaders?: Headers): Promise<Headers> {
  if (requestHeaders) return requestHeaders;
  const { headers } = await import("next/headers");
  return new Headers(await headers());
}

export async function getCurrentSession(
  requestHeaders?: Headers,
): Promise<AuthSession | null> {
  const session = await auth.api.getSession({
    headers: await resolveHeaders(requestHeaders),
  });
  return session ?? null;
}

/**
 * Asserts the caller is a signed-in Admin. Throws {@link AuthorizationError}
 * otherwise — `unauthenticated` for anonymous callers, `not-admin` for Members.
 */
export async function requireAdmin(
  requestHeaders?: Headers,
): Promise<AuthSession> {
  const session = await getCurrentSession(requestHeaders);
  if (!session) throw new AuthorizationError("unauthenticated");
  if (!isAdminRole(session.user.role)) {
    throw new AuthorizationError("not-admin");
  }
  return session;
}
