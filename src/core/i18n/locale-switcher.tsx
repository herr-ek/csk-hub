"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { writeBrowserLocaleCookie } from "./locale-cookie"
import { defaultLocale, isLocale, localeNames, locales } from "./locales"

/** Renders the locale control and refreshes the current route after an explicit selection. */
export function LocaleSwitcher() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations("Navigation")
  const selectedLocale = isLocale(locale) ? locale : defaultLocale

  function changeLocale(nextLocale: string) {
    if (!isLocale(nextLocale)) return

    writeBrowserLocaleCookie(nextLocale)
    router.refresh()
  }

  return (
    <label className="text-sm" htmlFor="locale">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="h-8 rounded-md border bg-background px-2"
        id="locale"
        onChange={(event) => changeLocale(event.target.value)}
        value={selectedLocale}
      >
        {locales.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {localeNames[supportedLocale]}
          </option>
        ))}
      </select>
    </label>
  )
}
