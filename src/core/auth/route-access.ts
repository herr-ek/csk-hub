import {
  type GlobalPermissionRequest,
  type PermissionSession,
  requireAdmin,
  requireCurrentUserPermission
} from "@/core/auth/permissions.server"
import { getPostLoginPath, loginPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"

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

/** Routes that need a specific permission rather than a role. */
const PERMISSION_PATHS = new Map<string, GlobalPermissionRequest>([
  [ROUTES.newsCompose, { resource: "post", action: "create" }]
])

export type RouteAccessPolicy =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "admin" }
  | { kind: "permission"; permission: GlobalPermissionRequest }
export type RouteSession = PermissionSession
export type AccessDecision = { kind: "allow" } | { kind: "redirect"; location: string } | { kind: "forbidden" }

function isAuthEntryRoute(pathname: string, requestedPath: string): boolean {
  if (pathname === ROUTES.resetPassword) {
    return !new URL(requestedPath, "http://csk-hub.local").searchParams.get("token")
  }

  return AUTH_ENTRY_PATHS.has(pathname)
}

// Identify what policy holds for *path*
export function getRouteAccessPolicy(path: string): RouteAccessPolicy {
  if (PUBLIC_PATHS.has(path)) return { kind: "public" }

  const permission = PERMISSION_PATHS.get(path)
  if (permission) return { kind: "permission", permission }

  if (path === ROUTES.admin || path.startsWith(`${ROUTES.admin}/`)) return { kind: "admin" }

  return { kind: "authenticated" }
}

// Enforce desicion depending on http context
export async function getRouteAccessDecision(
  pathname: string,
  session: RouteSession | null,
  requestedPath = pathname
): Promise<AccessDecision> {
  const policy = getRouteAccessPolicy(pathname)

  // 1. Logged in users go to their landing page instead of authentication entry pages.
  // A reset token remains accessible because it authorizes the reset workflow itself.
  if (session && isAuthEntryRoute(pathname, requestedPath))
    return { kind: "redirect", location: getPostLoginPath(session.user.role) }

  // 2. Public pages are always allowed
  if (policy.kind === "public") return { kind: "allow" }

  // 3. If you the requested path is not public, you need to login
  if (!session) return { kind: "redirect", location: loginPath(requestedPath) }

  // 4. Some pages ask for more than a session: the Admin area, or a named permission.
  if (policy.kind === "admin" || policy.kind === "permission") {
    try {
      if (policy.kind === "admin") await requireAdmin(session)
      else await requireCurrentUserPermission(policy.permission, session)
    } catch {
      return { kind: "forbidden" }
    }
  }

  // 5. All other pages are open to authenticated users
  return { kind: "allow" }
}
