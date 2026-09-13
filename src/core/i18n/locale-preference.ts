import type { Locale } from "./locales"

/**
 * Resolves the locale for a request from its browser-specific choice and the member's saved default.
 * A valid cookie is authoritative; the saved locale only initializes browsers without one.
 *
 * @param cookieLocale - The validated locale selected in the current browser, if present.
 * @param savedLocale - The validated locale stored in the member's preferences, or `null` when unset.
 * @returns The browser locale, then the saved locale, or `undefined` when neither exists.
 */
export function resolveLocalePreference(
  cookieLocale: Locale | undefined,
  savedLocale: Locale | null | undefined
): Locale | undefined {
  return cookieLocale ?? savedLocale ?? undefined
}
