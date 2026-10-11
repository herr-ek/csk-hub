import { isLocale } from "@/core/i18n/locales"
import { hasAdminRole } from "@/shared/roles"
import { ROUTES } from "./site"

const INTERNAL_PATH_ORIGIN = "http://csk-hub.local"

export function parseSafeInternalPath(path: string | undefined): string | undefined {
  if (
    !path?.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    [...path].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || code === 0x7f
    })
  ) {
    return undefined
  }

  try {
    const url = new URL(path, INTERNAL_PATH_ORIGIN)
    if (url.origin !== INTERNAL_PATH_ORIGIN || url.pathname.startsWith("//")) return undefined
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return undefined
  }
}

export function isSafeInternalPath(path: string | undefined): path is string {
  return parseSafeInternalPath(path) !== undefined
}

export function getPostLoginPath(role: string | null | undefined, returnTo?: string) {
  const safePath = parseSafeInternalPath(returnTo)
  if (safePath) return safePath
  return hasAdminRole(role) ? ROUTES.admin : ROUTES.home
}

export function loginPath(returnTo?: string) {
  const safePath = parseSafeInternalPath(returnTo)
  return safePath ? `${ROUTES.login}?returnTo=${encodeURIComponent(safePath)}` : ROUTES.login
}

export function twoFactorPath(methods: string[], returnTo?: string) {
  const params = new URLSearchParams({ methods: methods.join(",") })
  const safePath = parseSafeInternalPath(returnTo)
  if (safePath) params.set("returnTo", safePath)
  return `${ROUTES.twoFactor}?${params.toString()}`
}

/** Posts are reached by opaque id: Swedish titles change, permalinks must not. */
export function newsPostPath(postId: string) {
  return `${ROUTES.news}/${encodeURIComponent(postId)}`
}

/**
 * Whether `href` is the current page or one of its ancestors. The server may see the internal `/<locale>/…`
 * path that the locale rewrite produces, so the locale segment is ignored to keep server and client in agreement.
 */
export function isActiveRoute(pathname: string, href: string) {
  const [, first, ...rest] = pathname.split("/")
  const path = isLocale(first) ? `/${rest.join("/")}` : pathname
  if (href === ROUTES.home) return path === ROUTES.home
  return path === href || path.startsWith(`${href}/`)
}

/** Where a Post is written further: its author's draft, or a published Post to change. */
export function newsPostEditPath(postId: string) {
  return `${newsPostPath(postId)}/edit`
}

export function memberProfilePath(userId: string) {
  return `${ROUTES.members}/${encodeURIComponent(userId)}`
}
