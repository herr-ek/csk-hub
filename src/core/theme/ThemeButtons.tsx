"use client"

import { useHydrated, useTheme } from "@wrksz/themes/client"
import { useTranslations } from "@/core/i18n/translations"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/base/toggle-group"
import { isTheme, themes } from "./themes"

/** The theme as a row of buttons, for a menu that a dropdown of its own would close. */
export function ThemeButtons() {
  const t = useTranslations("Theme")
  const { setTheme, theme } = useTheme()
  const hydrated = useHydrated()

  return (
    <ToggleGroup
      aria-label={t("label")}
      size="sm"
      spacing={1}
      value={hydrated && isTheme(theme) ? [theme] : []}
      // Pressing the current theme again reports no value, and changes nothing.
      onValueChange={([value]) => {
        if (isTheme(value)) setTheme(value)
      }}
    >
      {themes.map(({ value, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={t(value)} title={t(value)}>
          <Icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
