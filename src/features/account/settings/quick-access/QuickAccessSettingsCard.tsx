"use client"

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTE_ICONS } from "@/core/navigation/route-icons"
import { type MenuRouteId, routeTrail } from "@/core/navigation/site"
import { QUICK_ACCESS_LIMIT } from "@/core/preferences/schema"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/shared/ui/base/field"
import { useQuickAccessSettings } from "./use-quick-access-settings"

export interface QuickAccessSettingsCardProps {
  saved: MenuRouteId[]
  /** The routes this member may pin, in menu order. */
  eligible: MenuRouteId[]
}

export function QuickAccessSettingsCard({ saved, eligible }: QuickAccessSettingsCardProps) {
  const t = useTranslations("QuickAccess")
  const routes = useTranslations("Navigation.routes")
  const { shortcuts, error, announcement, toggle, move } = useQuickAccessSettings(saved)
  const full = shortcuts.length >= QUICK_ACCESS_LIMIT
  const sections = groupBySection(eligible)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section aria-labelledby="quick-access-in-bar" className="flex flex-col gap-2">
          <h3 id="quick-access-in-bar" className="text-sm font-medium">
            {t("inBar")}
          </h3>
          {shortcuts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ol className="flex flex-col divide-y rounded-lg border">
              {shortcuts.map((id, index) => {
                const Icon = ROUTE_ICONS[id]
                const name = routes(id)
                return (
                  <li key={id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("moveUp", { name })}
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("moveDown", { name })}
                      disabled={index === shortcuts.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <FieldSet className="gap-4">
          <FieldLegend variant="label" className="mb-0">
            {t("available")}
          </FieldLegend>
          <FieldDescription>{t("limit", { count: QUICK_ACCESS_LIMIT })}</FieldDescription>
          {sections.map(({ section, ids }) => (
            <div key={section} className="flex flex-col gap-2.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{routes(section)}</p>
              {ids.map((id) => {
                const checked = shortcuts.includes(id)
                return (
                  <Field key={id} orientation="horizontal">
                    <Checkbox
                      id={`quick-access-${id}`}
                      checked={checked}
                      disabled={!checked && full}
                      onCheckedChange={() => toggle(id)}
                    />
                    <FieldLabel htmlFor={`quick-access-${id}`} className="font-normal">
                      {routes(id)}
                    </FieldLabel>
                  </Field>
                )
              })}
            </div>
          ))}
        </FieldSet>

        {error ? (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </CardContent>
    </Card>
  )
}

function groupBySection(ids: MenuRouteId[]) {
  const sections = new Map<MenuRouteId, MenuRouteId[]>()
  for (const id of ids) {
    const section = routeTrail(id)[0]
    sections.set(section, [...(sections.get(section) ?? []), id])
  }
  return [...sections].map(([section, sectionIds]) => ({ section, ids: sectionIds }))
}
