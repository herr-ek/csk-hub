import { isLocale, type Locale } from "./locales"

export const localeCookie = {
  name: "NEXT_LOCALE",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax"
} as const

type LocaleCookieStore = {
  set: (cookie: typeof localeCookie & { value: Locale }) => unknown
}

/** Writes a locale to a Next request or response cookie store using the shared cookie attributes. */
export function writeLocaleCookie(store: LocaleCookieStore, locale: Locale) {
  store.set({ ...localeCookie, value: locale })
}

/**
 * Returns a supported locale from the browser cookie. A cookie is a
 * per-browser choice, so it takes precedence over a member's saved default.
 */
export function getLocaleCookieValue(value: string | null | undefined): Locale | undefined {
  return isLocale(value) ? value : undefined
}

/** Persists an explicit browser-specific locale choice for the next request. */
export function writeBrowserLocaleCookie(locale: Locale) {
  document.cookie = `${localeCookie.name}=${locale}; path=${localeCookie.path}; max-age=${localeCookie.maxAge}; samesite=${localeCookie.sameSite}`
}
