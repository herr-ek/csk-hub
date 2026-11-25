import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import { type IsoDate, organisationYearPeriod } from "@/core/org-structure"
import { buttonVariants } from "@/shared/ui/base/button"
import { cn } from "@/shared/utils"
import { yearLabel, yearPhase } from "../roster"

/** Steps between Organisational years; each year is its own address. */
export function YearStepper({
  year,
  years,
  today,
  href
}: {
  year: number
  years: number[]
  today: IsoDate
  href: (year: number) => string
}) {
  const t = useTranslations("OrgAdmin.year")
  const step = (to: number, label: string, Icon: typeof ChevronLeftIcon) =>
    years.includes(to) ? (
      <Link href={href(to)} aria-label={label} className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
        <Icon aria-hidden="true" />
      </Link>
    ) : (
      <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline", size: "icon" }), "opacity-40")}>
        <Icon />
      </span>
    )
  return (
    <nav aria-label={t("label")} className="flex items-center gap-2">
      {step(year - 1, t("previous"), ChevronLeftIcon)}
      <span className="min-w-28 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {t(yearPhase(year, today), { year: yearLabel(year) })}
      </span>
      {step(year + 1, t("next"), ChevronRightIcon)}
    </nav>
  )
}

/** Says what it means to look at a year other than the current one. */
export function YearBanner({ year, today, setUp }: { year: number; today: IsoDate; setUp: boolean }) {
  const t = useTranslations("OrgAdmin.year")
  const format = useFormatter()
  const phase = yearPhase(year, today)
  if (phase === "ended")
    return <p className="rounded-2xl bg-muted px-4 py-3 text-sm">{t("finishedNotice", { year: yearLabel(year) })}</p>
  if (phase === "current") return null
  const start = new Date(`${organisationYearPeriod(year).startDate}T12:00:00Z`)
  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
      <p>
        <strong>{t("startsOn", { year: yearLabel(year), date: format.dateTime(start, { dateStyle: "long" }) })}</strong>{" "}
        {t("plannedNotice")}
      </p>
      {setUp ? null : <p className="text-muted-foreground">{t("notSetUp")}</p>}
    </div>
  )
}
