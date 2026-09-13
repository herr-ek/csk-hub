"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useLocale } from "@/core/i18n/client"
import { writeBrowserLocaleCookie } from "@/core/i18n/locale-cookie"
import { defaultLocale, isLocale, type Locale } from "@/core/i18n/locales"
import { useTranslations } from "@/core/i18n/translations"
import { updateLocalePreference } from "./actions"

export function useLanguageSettings() {
  const activeLocale = useLocale()
  const resolvedLocale = isLocale(activeLocale) ? activeLocale : defaultLocale
  const t = useTranslations("AccountSettings")
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(resolvedLocale)
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    setLocale(resolvedLocale)
  }, [resolvedLocale])

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
