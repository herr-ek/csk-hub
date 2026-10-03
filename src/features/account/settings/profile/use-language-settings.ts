"use client"

import { useState } from "react"
import type { Locale } from "@/core/i18n/locales"
import { useTranslations } from "@/core/i18n/translations"
import { updateLocalePreference } from "./actions"

/** Saves the member's locale preference before the shared locale switcher applies it. */
export function useLanguageSettings() {
  const t = useTranslations("AccountSettings")
  const [error, setError] = useState<string>()

  async function persistLocale(locale: Locale) {
    setError(undefined)
    try {
      const result = await updateLocalePreference(locale)
      if (result.success) return true
    } catch {}

    setError(t("languageUpdateFailed"))
    return false
  }

  return { error, persistLocale }
}
