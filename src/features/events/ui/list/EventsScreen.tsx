import { CalendarPlus, MapPin } from "lucide-react"
import Link from "next/link"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { Badge } from "@/shared/ui/base/badge"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { addDays, EVENT_STATUSES, EVENT_TYPES, stockholmDate, stockholmInstant } from "../../model"
import { adminEventPath } from "../command-state"
import { StatusBadge } from "../StatusBadge"
import { EventFilters } from "./EventFilters"
import { type EventListFilters, type EventListRow, listAdminEvents } from "./query"

type SearchParams = Record<string, string | string[] | undefined>

/** The filters an address asks for; anything unknown is ignored. */
function filtersFrom(searchParams: SearchParams): EventListFilters {
  const one = (name: string) => {
    const value = searchParams[name]
    return typeof value === "string" ? value : undefined
  }
  const status = EVENT_STATUSES.find((value) => value === one("status"))
  const type = EVENT_TYPES.find((value) => value === one("type"))
  return { when: one("when") === "past" ? "past" : "upcoming", status, type }
}

/** Every Event in the CSK calendar, in any status, for the Admin to manage. */
export async function EventsScreen({ searchParams }: { searchParams: SearchParams }) {
  const filters = filtersFrom(searchParams)
  const [events, t] = await Promise.all([listAdminEvents(filters, new Date()), getTranslations("Events")])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <EventsHeader />
      <EventFilters filters={filters} />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(filters.when === "past" ? "list.noPast" : "list.noUpcoming")}
        </p>
      ) : (
        <Card className="gap-0 divide-y py-0">
          {events.map((row) => (
            <EventRow key={row.id} row={row} />
          ))}
        </Card>
      )}
    </main>
  )
}

async function EventsHeader() {
  const t = await getTranslations("Events")
  return (
    <div className="flex flex-col gap-2">
      <PageBreadcrumb route="adminEvents" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("list.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("list.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={ROUTES.adminEventLocations} className={buttonVariants({ variant: "outline" })}>
            <MapPin aria-hidden="true" />
            {t("list.locations")}
          </Link>
          <Link href={ROUTES.adminEventsNew} className={buttonVariants()}>
            <CalendarPlus aria-hidden="true" />
            {t("list.new")}
          </Link>
        </div>
      </div>
    </div>
  )
}

async function EventRow({ row }: { row: EventListRow }) {
  const [t, types, format] = await Promise.all([
    getTranslations("Events.list"),
    getTranslations("Events.types"),
    getFormatter()
  ])
  // An all-day Event ends at 00:00 after its last day, which is the day to show.
  const when = row.allDay
    ? format.dateTimeRange(row.startsAt, stockholmInstant(addDays(stockholmDate(row.endsAt), -1)) as Date, {
        dateStyle: "medium"
      })
    : format.dateTimeRange(row.startsAt, row.endsAt, { dateStyle: "medium", timeStyle: "short" })
  const audience =
    row.targets.length === 0
      ? t("everyoneInCsk")
      : row.targets
          .map(({ group, voiceFamily }) => {
            if (group && voiceFamily) return t("voiceInGroup", { voice: voiceFamily, group })
            if (voiceFamily) return t("voiceInCsk", { voice: voiceFamily })
            return group ?? ""
          })
          .join(", ")
  const cancelled = row.status === "Cancelled"

  return (
    <Link
      href={adminEventPath(row.id)}
      className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <time dateTime={row.startsAt.toISOString()}>{when}</time>
        {row.allDay ? <span>{t("allDay")}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("font-medium", cancelled && "text-muted-foreground line-through")}>{row.title}</span>
        <Badge variant="outline">{types(row.type)}</Badge>
        <StatusBadge status={row.status} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{t("audience", { audience })}</span>
        {row.organiserGroup ? <span>{t("organisedBy", { group: row.organiserGroup })}</span> : null}
      </div>
    </Link>
  )
}

export async function EventsScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <EventsHeader />
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
