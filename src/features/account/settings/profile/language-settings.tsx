"use client"

import { LocaleSwitcher } from "@/core/i18n/locale-switcher"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { useLanguageSettings } from "./use-language-settings"

export function LanguageSettings() {
  const t = useTranslations("AccountSettings")
  const { error, persistLocale } = useLanguageSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("languageTitle")}</CardTitle>
        <CardDescription>{t("languageDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="settings-language">{t("languageTitle")}</FieldLabel>
          <LocaleSwitcher
            id="settings-language"
            size="default"
            className="mt-1 w-full sm:w-56"
            persistLocale={persistLocale}
          />
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
