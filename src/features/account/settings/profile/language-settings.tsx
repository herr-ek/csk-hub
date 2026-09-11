"use client"

import { getLocaleName, isLocale, localeNames, locales } from "@/core/i18n/locales"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { useLanguageSettings } from "./use-language-settings"

export function LanguageSettings({ initialLocale }: { initialLocale?: string | null }) {
  const t = useTranslations("AccountSettings")
  const { changeLocale, error, isPending, locale } = useLanguageSettings(initialLocale)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("languageTitle")}</CardTitle>
        <CardDescription>{t("languageDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="settings-language">{t("languageTitle")}</FieldLabel>
          <Select
            value={locale}
            onValueChange={(value) => {
              if (isLocale(value)) void changeLocale(value)
            }}
            disabled={isPending}
          >
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
