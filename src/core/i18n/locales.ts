export const locales = ["en", "sv", "de"] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "sv"

export const localeNames = {
  en: "English",
  sv: "Svenska",
  de: "Deutsch"
} satisfies Record<Locale, string>

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale)
}

/** Returns a locale's display name, falling back to the default locale for invalid values. */
export function getLocaleName(value: string | null | undefined): string {
  return isLocale(value) ? localeNames[value] : localeNames[defaultLocale]
}
