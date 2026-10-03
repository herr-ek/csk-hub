"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useOptimistic, useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { writeBrowserLocaleCookie } from "./locale-cookie"
import { LocaleFlag } from "./locale-flag"
import { defaultLocale, getLocaleName, isLocale, type Locale, localeNames, locales } from "./locales"

export interface LocaleSwitcherProps {
  id?: string
  className?: string
  size?: "sm" | "default"
  /**
   * Runs before the locale cookie is written, e.g. to save the member's preference.
   * Return `false` to keep the current locale.
   */
  persistLocale?: (locale: Locale) => Promise<boolean>
}

/** Renders the locale control and refreshes the current route after an explicit selection. */
export function LocaleSwitcher({ id, className, size = "sm", persistLocale }: LocaleSwitcherProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations("Navigation")
  const [isPending, startTransition] = useTransition()
  const [selectedLocale, setOptimisticLocale] = useOptimistic<Locale>(isLocale(locale) ? locale : defaultLocale)

  function changeLocale(nextLocale: string | null) {
    if (!isLocale(nextLocale) || nextLocale === selectedLocale) return

    startTransition(async () => {
      setOptimisticLocale(nextLocale)
      if (persistLocale && !(await persistLocale(nextLocale))) return

      writeBrowserLocaleCookie(nextLocale)
      router.refresh()
    })
  }

  return (
    <Select value={selectedLocale} onValueChange={changeLocale} disabled={isPending}>
      <SelectTrigger id={id} aria-label={t("language")} size={size} className={className}>
        <SelectValue>
          {(value: string | null) => (
            <>
              <LocaleFlag locale={isLocale(value) ? value : defaultLocale} />
              {getLocaleName(value)}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="p-1.5">
        {locales.map((supportedLocale) => (
          <SelectItem key={supportedLocale} value={supportedLocale} className="">
            <LocaleFlag locale={supportedLocale} />
            {localeNames[supportedLocale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
