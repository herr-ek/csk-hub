import { io } from "next/cache"
import { notFound } from "next/navigation"
import { AuthorizationDeniedError } from "@/core/authz"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { type ScheduleFilters as Filters, getRehearsalSchedule } from "./query"
import { RehearsalGenerator } from "./RehearsalGenerator"
import { ScheduledRehearsals } from "./ScheduledRehearsals"
import { ScheduleFilters } from "./ScheduleFilters"

type SearchParams = Record<string, string | string[] | undefined>

/** The filters an address asks for; anything unknown is ignored. */
function filtersFrom(searchParams: SearchParams): Filters {
  const one = (name: string) => {
    const value = searchParams[name]
    return typeof value === "string" ? value : undefined
  }
  const choir = one("choir")
  return {
    when: one("when") === "past" ? "past" : "upcoming",
    choirGroupId: choir && /^[0-9a-f-]{36}$/i.test(choir) ? choir : undefined
  }
}

/** The Board's and Admins' rehearsal schedule: generate a Choir's Series, then adjust and publish it. */
export async function RehearsalScheduleScreen({ searchParams }: { searchParams: SearchParams }) {
  await io()
  const filters = filtersFrom(searchParams)
  const schedule = await getRehearsalSchedule(filters, new Date()).catch((error: unknown) => {
    if (error instanceof AuthorizationDeniedError) return null
    throw error
  })
  if (!schedule) notFound()
  const [t, format] = await Promise.all([getTranslations("Events.schedule"), getFormatter()])

  const rehearsals = schedule.rehearsals.map((row) => ({
    ...row,
    when: format.dateTimeRange(row.startsAt, row.endsAt, { dateStyle: "full", timeStyle: "short" })
  }))

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="eventsRehearsals" />
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <RehearsalGenerator choirs={schedule.choirs} locations={schedule.locations} today={schedule.today} />
      <section className="flex flex-col gap-4" aria-labelledby="scheduled-rehearsals">
        <h2 id="scheduled-rehearsals" className="font-heading text-lg font-semibold">
          {t("list.heading")}
        </h2>
        <ScheduleFilters filters={filters} choirs={schedule.choirs} />
        <ScheduledRehearsals rehearsals={rehearsals} locations={schedule.locations} when={filters.when} />
      </section>
    </main>
  )
}

export async function RehearsalScheduleScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
