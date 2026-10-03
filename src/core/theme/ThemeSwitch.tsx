"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { useHydrated, useTheme } from "@wrksz/themes/client"
import { Monitor, Moon, Sun } from "lucide-react"

import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Select, SelectContent, SelectItem, SelectValue } from "@/shared/ui/base/select"
import { cn } from "@/shared/utils"

const themes = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
] as const

type Theme = (typeof themes)[number]["value"]

function isTheme(value: unknown): value is Theme {
  return themes.some((theme) => theme.value === value)
}

export interface ThemeSwitchProps {
  id?: string
  className?: string
}

export function ThemeSwitch({ id, className }: ThemeSwitchProps) {
  const t = useTranslations("Theme")
  const { setTheme, theme } = useTheme()
  // The stored theme is only known in the browser; render no selection on the server to avoid a hydration mismatch.
  const hydrated = useHydrated()
  const selectedTheme = hydrated && isTheme(theme) ? theme : null

  return (
    <Select
      value={selectedTheme}
      onValueChange={(value) => {
        if (isTheme(value)) setTheme(value)
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={t("label")}
        render={
          <Button
            variant="outline"
            size="icon"
            className={cn("dark:border-foreground/25 dark:hover:bg-muted dark:aria-expanded:bg-muted", className)}
          />
        }
      >
        <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <SelectValue className="sr-only">{(value: Theme | null) => (value ? t(value) : null)}</SelectValue>
      </SelectPrimitive.Trigger>
      <SelectContent alignItemWithTrigger={false} className="p-1.5">
        {themes.map(({ value, icon: Icon }) => (
          <SelectItem key={value} value={value}>
            <Icon />
            {t(value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
