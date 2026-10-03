import { useTranslations } from "@/core/i18n/translations"
import { ThemeSwitch } from "@/core/theme/ThemeSwitch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldLabel } from "@/shared/ui/base/field"

export function ThemeSettings() {
  const t = useTranslations("AccountSettings")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("themeTitle")}</CardTitle>
        <CardDescription>{t("themeDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="settings-theme">{t("themeTitle")}</FieldLabel>
          <ThemeSwitch id="settings-theme" className="mt-1" />
        </Field>
      </CardContent>
    </Card>
  )
}
