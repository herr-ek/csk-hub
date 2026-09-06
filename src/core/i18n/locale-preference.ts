import { isLocale, type Locale } from "./locales"

export function getSavedLocale(user: { locale?: string | null } | null | undefined): Locale | undefined {
  return user && isLocale(user.locale) ? user.locale : undefined
}

/**
 * A valid browser cookie is an explicit, browser-specific choice. Use a
 * member's saved locale only to initialize browsers without that choice.
 */
export function resolveLocalePreference(
  cookieLocale: Locale | undefined,
  savedLocale: Locale | undefined
): Locale | undefined {
  return cookieLocale ?? savedLocale
}
