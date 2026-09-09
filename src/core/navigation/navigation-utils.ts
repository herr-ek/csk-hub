import { hasAdminRole } from "@/shared/roles"
import { ROUTES } from "./site"

export function isSafeInternalPath(path: string | undefined): path is string {
  return Boolean(path?.startsWith("/") && !path.startsWith("//") && !path.includes("\\"))
}

export function getPostLoginPath(role: string | null | undefined, returnTo?: string) {
  if (isSafeInternalPath(returnTo)) return returnTo
  return hasAdminRole(role) ? ROUTES.admin : ROUTES.home
}

export function loginPath(returnTo?: string) {
  return isSafeInternalPath(returnTo) ? `${ROUTES.login}?returnTo=${encodeURIComponent(returnTo)}` : ROUTES.login
}

export function twoFactorPath(methods: string[], returnTo?: string) {
  const params = new URLSearchParams({ methods: methods.join(",") })
  if (isSafeInternalPath(returnTo)) params.set("returnTo", returnTo)
  return `${ROUTES.twoFactor}?${params.toString()}`
}

/** Posts are reached by opaque id: Swedish titles change, permalinks must not. */
export function newsPostPath(postId: string) {
  return `${ROUTES.news}/${encodeURIComponent(postId)}`
}
