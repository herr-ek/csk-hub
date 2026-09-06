"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { writeBrowserLocaleCookie } from "@/core/i18n/locale-cookie"
import { defaultLocale, getLocaleName, isLocale, type Locale, localeNames, locales } from "@/core/i18n/locales"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"

export function LanguageSettings({ initialLocale }: { initialLocale?: string | null }) {
  const t = useTranslations("AccountSettings")
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(isLocale(initialLocale) ? initialLocale : defaultLocale)
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || isPending) return

    setError(undefined)
    setIsPending(true)
    try {
      const result = await authClient.updateUser({ locale: nextLocale })
      if (result.error) {
        setError(result.error.message ?? t("languageUpdateFailed"))
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("languageTitle")}</CardTitle>
        <CardDescription>{t("languageDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="settings-language">{t("languageTitle")}</FieldLabel>
          <Select value={locale} onValueChange={(value) => void changeLocale(value as Locale)} disabled={isPending}>
            <SelectTrigger id="settings-language" className="mt-1 w-full sm:w-56">
              <SelectValue>{getLocaleName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {locales.map((supportedLocale) => (
                <SelectItem key={supportedLocale} value={supportedLocale}>
                  {localeNames[supportedLocale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {error ? (
          <Alert className="mt-4 py-2" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
