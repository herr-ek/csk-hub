"use client"

import { useRouter } from "next/navigation"
import { useId, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/base/toggle-group"

export type PositionView = "historical" | "current" | "future"

/** Address of one Positions view; the current view keeps the bare page URL. */
export function positionsViewHref(view: PositionView, year?: number) {
  if (view === "current") return ROUTES.adminPositions
  if (view === "future") return `${ROUTES.adminPositions}?view=future`
  return `${ROUTES.adminPositions}?view=historical&year=${year}`
}

export function PositionPeriodPicker({
  years,
  view,
  selectedYear
}: {
  years: number[]
  view: PositionView
  selectedYear: number
}) {
  const t = useTranslations("PositionsPage")
  const id = useId()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }))
  return (
    <div className="flex flex-wrap items-end gap-4" aria-busy={pending}>
      <ToggleGroup
        aria-label={t("period")}
        value={[view]}
        onValueChange={(values) => {
          const next = values[0] as PositionView | undefined
          if (next && next !== view) navigate(positionsViewHref(next, selectedYear))
        }}
        disabled={pending}
      >
        <ToggleGroupItem value="historical">{t("history")}</ToggleGroupItem>
        <ToggleGroupItem value="current">{t("current")}</ToggleGroupItem>
        <ToggleGroupItem value="future">{t("future")}</ToggleGroupItem>
      </ToggleGroup>
      {view === "historical" ? (
        <Field className="w-fit min-w-40">
          <FieldLabel htmlFor={id}>{t("year")}</FieldLabel>
          <Select
            value={String(selectedYear)}
            onValueChange={(value) => value && navigate(positionsViewHref("historical", Number(value)))}
            items={years.map((year) => ({
              value: String(year),
              label: t("yearValue", { start: year, end: year + 1 })
            }))}
          >
            <SelectTrigger id={id} disabled={pending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {t("yearValue", { start: year, end: year + 1 })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </div>
  )
}
