import { locales } from "@/core/i18n/locales"
import { getPostLoginPath, loginPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { hasAdminRole } from "@/shared/roles"

/** Access rules use locale-neutral paths, including when Proxy sees an internal locale rewrite. */
function accessPath(path: string): string {
  const locale = locales.find((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`))
  return locale ? path.slice(locale.length + 1) || "/" : path
}

const PUBLIC_PATHS = new Set<string>([
  ROUTES.login,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.activationFailed,
  ROUTES.twoFactor
])
const AUTH_ENTRY_PATHS = new Set<string>([
  ROUTES.login,
  ROUTES.forgotPassword,
  ROUTES.activationFailed,
  ROUTES.twoFactor
])

export type RouteAccessPolicy = { kind: "public" } | { kind: "authenticated" } | { kind: "admin" }
export type RouteSession = { user: { id: string; role?: string | null } }
export type AccessDecision = { kind: "allow" } | { kind: "redirect"; location: string } | { kind: "forbidden" }

function isAuthEntryRoute(pathname: string, requestedPath: string): boolean {
  if (pathname === ROUTES.resetPassword) {
    return !new URL(requestedPath, "http://csk-hub.local").searchParams.get("token")
  }

  return AUTH_ENTRY_PATHS.has(pathname)
}

// Identify what policy holds for *path*
export function getRouteAccessPolicy(path: string): RouteAccessPolicy {
  path = accessPath(path)
  if (PUBLIC_PATHS.has(path)) return { kind: "public" }

  if (path === ROUTES.admin || path.startsWith(`${ROUTES.admin}/`)) return { kind: "admin" }

  return { kind: "authenticated" }
}

// Enforce desicion depending on http context
export async function getRouteAccessDecision(
  pathname: string,
  session: RouteSession | null,
  requestedPath = pathname
): Promise<AccessDecision> {
  pathname = accessPath(pathname)
  requestedPath = accessPath(requestedPath)
  const policy = getRouteAccessPolicy(pathname)

  // 1. Logged in users go to their landing page instead of authentication entry pages.
  // A reset token remains accessible because it authorizes the reset workflow itself.
  if (session && isAuthEntryRoute(pathname, requestedPath))
    return { kind: "redirect", location: getPostLoginPath(session.user.role) }

  // 2. Public pages are always allowed
  if (policy.kind === "public") return { kind: "allow" }

  // 3. If you the requested path is not public, you need to login
  if (!session) return { kind: "redirect", location: loginPath(requestedPath) }

  // Cached session roles only shape navigation; protected pages/data/actions use fresh authz.
  if (policy.kind === "admin" && !hasAdminRole(session.user.role)) return { kind: "forbidden" }

  // 4. All other pages are open to authenticated users
  return { kind: "allow" }
}
