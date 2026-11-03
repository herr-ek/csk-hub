"use client"

import { useRouter } from "next/navigation"
import { useId, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"

export function PositionPeriodPicker({ years, selectedYear }: { years: number[]; selectedYear?: number }) {
  const t = useTranslations("PositionsPage")
  const id = useId()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const navigate = (year?: number) =>
    startTransition(() =>
      router.push(year === undefined ? ROUTES.adminPositions : `${ROUTES.adminPositions}?year=${year}`, {
        scroll: false
      })
    )
  return (
    <div className="flex flex-wrap items-end gap-4" aria-busy={pending}>
      <Tabs
        value={selectedYear === undefined ? "current" : "history"}
        onValueChange={(value) => navigate(value === "current" ? undefined : years[0])}
      >
        <TabsList aria-label={t("period")}>
          <TabsTrigger value="current" disabled={pending}>
            {t("current")}
          </TabsTrigger>
          <TabsTrigger value="history" disabled={pending}>
            {t("history")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {selectedYear !== undefined ? (
        <Field className="w-fit min-w-40">
          <FieldLabel htmlFor={id}>{t("year")}</FieldLabel>
          <Select
            value={String(selectedYear)}
            onValueChange={(value) => value && navigate(Number(value))}
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
