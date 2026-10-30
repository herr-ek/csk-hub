"use client"

import { useId, useState } from "react"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import { positionCodeKey, shiftDate } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { type CareerRecord, careerChapters } from "./timeline"

export function CareerTimeline({ records, through }: { records: CareerRecord[]; through: string }) {
  const t = useTranslations("MemberCareer")
  const positions = useTranslations("Groups.positionLabels")
  const format = useFormatter()
  const id = useId()
  const [scope, setScope] = useState("all")
  const chapters = careerChapters(records, through).filter(
    (chapter) => scope === "all" || chapter.scopes.some((part) => part.id === scope)
  )
  const scopes = [
    ...new Map(
      records.map((record) => [
        record.scopeId ?? "csk",
        { value: record.scopeId ?? "csk", label: record.scopeName ?? t("csk") }
      ])
    ).values()
  ]
  scopes.sort((a, b) => Number(b.value === "csk") - Number(a.value === "csk") || a.label.localeCompare(b.label))
  const options = [{ value: "all", label: t("allScopes") }, ...scopes]
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
  if (chapters.length === 0) return <p className="max-w-prose text-muted-foreground">{t("empty")}</p>
  return (
    <div className="flex flex-col gap-10">
      <div className="sticky top-16 z-10 flex flex-col gap-4 border-b bg-background/95 py-4 backdrop-blur-sm sm:flex-row sm:items-end sm:justify-between">
        <nav aria-label={t("years")} className="flex min-w-0 gap-1 overflow-x-auto pb-1">
          {chapters.map(({ year }) => (
            <a
              key={year}
              href={`#career-year-${year}`}
              className="shrink-0 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("yearValue", { start: String(year).slice(-2), end: String(year + 1).slice(-2) })}
            </a>
          ))}
        </nav>
        <Field className="w-full shrink-0 sm:w-52">
          <FieldLabel htmlFor={id}>{t("show")}</FieldLabel>
          <Select value={scope} onValueChange={(value) => value && setScope(value)} items={options}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex flex-col gap-14">
        {chapters.map((chapter) => {
          const visible = chapter.scopes.filter((item) => scope === "all" || item.id === scope)
          return (
            <section
              key={chapter.year}
              id={`career-year-${chapter.year}`}
              aria-labelledby={`career-title-${chapter.year}`}
              className="grid scroll-mt-56 gap-6 sm:scroll-mt-40 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10"
            >
              <div className="border-l-4 border-primary/60 pl-4">
                <h2
                  id={`career-title-${chapter.year}`}
                  className="font-[family-name:var(--font-geist-sans)] text-3xl font-medium tracking-tight tabular-nums lg:text-4xl"
                >
                  {t("yearValue", { start: chapter.year, end: String(chapter.year + 1).slice(-2) })}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("organisationalYear")}</p>
              </div>
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("emptyYear")}</p>
              ) : (
                <div className="grid min-w-0 gap-8 xl:grid-cols-2">
                  {visible.map((part) => (
                    <div key={part.id} className="min-w-0">
                      <h3 className="mb-4 border-b pb-2 text-lg font-semibold">{part.name ?? t("csk")}</h3>
                      <ul className="flex flex-col gap-4">
                        {part.entries.map((entry) => (
                          <li
                            key={entry.key}
                            className={
                              entry.kind === "position"
                                ? "rounded-r-xl border-l-2 border-primary bg-primary/5 p-4"
                                : "rounded-r-xl border-l-2 border-teal-700/30 py-2 pl-4 dark:border-teal-400/40"
                            }
                          >
                            <div className="flex flex-wrap items-start gap-2">
                              <h4 className="min-w-0 font-semibold wrap-break-word">
                                {entry.positionCode ? positions(positionCodeKey(entry.positionCode)) : entry.label}
                              </h4>
                              {entry.kind === "position" ? <Badge variant="outline">{t("position")}</Badge> : null}
                            </div>
                            {entry.kind === "position" ? (
                              <p className="mt-1 text-sm text-muted-foreground">{entry.label}</p>
                            ) : null}
                            <ul className="mt-2 flex flex-col gap-2">
                              {entry.periods.map((period) => (
                                <li key={period.id} className="text-sm">
                                  <p className="text-muted-foreground">
                                    {t("period", {
                                      start: date(period.startDate),
                                      end: period.endDate ? date(shiftDate(period.endDate, -1)) : t("ongoing")
                                    })}
                                  </p>
                                  {period.kind === "membership" && period.positionCode ? (
                                    <p className="mt-1 text-muted-foreground">
                                      {t("throughPosition", {
                                        position: positions(positionCodeKey(period.positionCode)),
                                        context: period.sourceContext ?? ""
                                      })}
                                    </p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {period.voice ? <Badge variant="outline">{period.voice}</Badge> : null}
                                    {!period.active ? <Badge variant="secondary">{t("archivedGroup")}</Badge> : null}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
