"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { writeBrowserLocaleCookie } from "@/core/i18n/locale-cookie"
import { defaultLocale, isLocale, type Locale } from "@/core/i18n/locales"
import { useTranslations } from "@/core/i18n/translations"
import { updateLocalePreference } from "./actions"

export function useLanguageSettings(initialLocale?: string | null) {
  const t = useTranslations("AccountSettings")
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(isLocale(initialLocale) ? initialLocale : defaultLocale)
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setLocale(isLocale(initialLocale) ? initialLocale : defaultLocale)
  }, [initialLocale])

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || isPending) return

    setError(undefined)
    setIsPending(true)
    try {
      const result = await updateLocalePreference(nextLocale)
      if (!result.success) {
        setError(t("languageUpdateFailed"))
        return
      }

      writeBrowserLocaleCookie(nextLocale)
      setLocale(nextLocale)
      router.refresh()
    } catch {
      setError(t("languageUpdateFailed"))
    } finally {
      setIsPending(false)
    }
  }

  return { changeLocale, error, isPending, locale }
}
