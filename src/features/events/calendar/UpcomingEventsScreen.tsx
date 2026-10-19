import Link from "next/link"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { eventPath } from "@/core/navigation/navigation-utils"
import { ContentPage } from "@/shared/layouts/content-page"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/base/empty"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { EVENT_TYPES, stockholmInstant } from "../model"
import { StatusBadge } from "../ui/StatusBadge"
import { eventDays, groupByDay } from "./days"
import { EventKind } from "./EventKind"
import { listUpcomingEventsForUser, type UpcomingEvent } from "./query"
import { UpcomingEventsFilter } from "./UpcomingEventsFilter"

async function UpcomingEventsHeader() {
  const t = await getTranslations("Events.calendar")
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
    </div>
  )
}

type SearchParams = Record<string, string | string[] | undefined>

/** The signed-in User's upcoming Events, by month and day in Europe/Stockholm, optionally of one type. */
export async function UpcomingEventsScreen({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireAuthenticatedUser()
  const [{ events: upcoming, inChoir }, t, format] = await Promise.all([
    listUpcomingEventsForUser(db, userId, new Date()),
    getTranslations("Events.calendar"),
    getFormatter()
  ])
  // An unknown type in the address is ignored, as in the admin list's filters.
  const type = EVENT_TYPES.find((value) => value === searchParams.type)
  // Only the types the User has coming up are worth offering, plus the one already chosen.
  const types = EVENT_TYPES.filter((value) => value === type || upcoming.some((event) => event.type === value))
  const months = groupByDay(type ? upcoming.filter((event) => event.type === type) : upcoming)
  // Several months get a heading each; within one month, the day headings say enough.
  const monthHeadings = months.length > 1

  return (
    <ContentPage>
      <UpcomingEventsHeader />
      {types.length > 1 || type ? <UpcomingEventsFilter type={type} types={types} /> : null}
      {months.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t(type ? "noMatchTitle" : inChoir ? "emptyTitle" : "noChoirTitle")}</EmptyTitle>
            <EmptyDescription>
              {t(type ? "noMatchDescription" : inChoir ? "emptyDescription" : "noChoirDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        months.map(({ month, days }) => (
          <section key={month} className="flex flex-col gap-4">
            {monthHeadings ? (
              <h2 className="font-heading text-lg font-semibold">
                {format.dateTime(stockholmInstant(`${month}-01`) as Date, { month: "long", year: "numeric" })}
              </h2>
            ) : null}
            {days.map(({ day, events }) => (
              <section key={day} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {format.dateTime(stockholmInstant(day) as Date, { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <ul className="flex flex-col divide-y rounded-xl border">
                  {events.map((event) => (
                    <li key={event.id}>
                      <UpcomingEventEntry event={event} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))
      )}
    </ContentPage>
  )
}

async function UpcomingEventEntry({ event }: { event: UpcomingEvent }) {
  const [t, format] = await Promise.all([getTranslations("Events.calendar"), getFormatter()])
  const { firstDay, lastDay } = eventDays(event)
  const multiDay = lastDay !== firstDay
  const time = event.allDay
    ? t("allDay")
    : multiDay
      ? format.dateTime(event.startsAt, { timeStyle: "short" })
      : format.dateTimeRange(event.startsAt, event.endsAt, { timeStyle: "short" })
  // An Event over several days is listed on its first, and says when it ends.
  const until = multiDay
    ? t("until", {
        end: event.allDay
          ? format.dateTime(stockholmInstant(lastDay) as Date, { weekday: "short", day: "numeric", month: "short" })
          : format.dateTime(event.endsAt, { dateStyle: "medium", timeStyle: "short" })
      })
    : null
  const cancelled = event.status === "Cancelled"

  return (
    <Link
      href={eventPath(event.id)}
      className="flex gap-4 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <time
        dateTime={event.startsAt.toISOString()}
        className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground"
      >
        {time}
      </time>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium break-words", cancelled && "text-muted-foreground line-through")}>
            {event.title}
          </span>
          {cancelled ? <StatusBadge status={event.status} /> : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            <EventKind type={event.type} rehearsalKind={event.rehearsalKind} />
          </span>
          {event.location ? <span className="break-words">{event.location}</span> : null}
          {until ? <span>{until}</span> : null}
        </div>
      </div>
    </Link>
  )
}

export async function UpcomingEventsScreenSkeleton() {
  return (
    <ContentPage busy>
      <UpcomingEventsHeader />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </ContentPage>
  )
}
