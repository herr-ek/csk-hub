import Link from "next/link"
import { cache } from "react"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { eventPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard, OverviewList, overviewRowClassName } from "@/shared/layouts/overview-card"
import { Card, CardContent } from "@/shared/ui/base/card"
import { cn } from "@/shared/utils"
import { addDays, stockholmDate } from "../model"
import { StatusBadge } from "../ui/StatusBadge"
import { happensOn } from "./days"
import { EventKind } from "./EventKind"
import { listUpcomingEventsForUser, type UpcomingEvent } from "./query"

/** How many Events "Coming up" lists after the next one. */
const COMING_UP = 4

/** The User's upcoming Events and today's date, read once per render however many cards ask. */
const upcomingForHome = cache(async () => {
  const userId = await requireAuthenticatedUser()
  const now = new Date()
  const { events } = await listUpcomingEventsForUser(db, userId, now)
  return { events, today: stockholmDate(now) }
})

/** The User's very next Event, large, so a rehearsal tonight (or its cancellation) can't be missed. */
export async function NextEventCard({ className }: { className?: string }) {
  const [{ events, today }, t, format] = await Promise.all([
    upcomingForHome(),
    getTranslations("HomePage.events"),
    getFormatter()
  ])
  const next = events[0]
  if (!next) {
    return (
      <OverviewCard title={t("title")} link={{ href: ROUTES.events, label: t("seeAll") }} className={className}>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </OverviewCard>
    )
  }

  const isToday = happensOn(next, today)
  const cancelled = next.status === "Cancelled"
  const when = isToday
    ? t("today")
    : happensOn(next, addDays(today, 1))
      ? t("tomorrow")
      : format.dateTime(next.startsAt, { weekday: "long", day: "numeric", month: "long" })

  return (
    <Card size="sm" className={cn("bg-primary/5", className)}>
      <CardContent>
        <Link href={eventPath(next.id)} className={cn(overviewRowClassName, "-m-2 flex-col gap-1")}>
          <span className="text-xs font-semibold tracking-wide text-primary uppercase">
            {t("nextUpWhen", { when })}
          </span>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <time dateTime={next.startsAt.toISOString()} className="font-heading text-2xl font-semibold tabular-nums">
              {next.allDay ? t("allDay") : format.dateTime(next.startsAt, { timeStyle: "short" })}
            </time>
            <span
              className={cn(
                "font-heading text-xl font-semibold break-words",
                cancelled && "text-muted-foreground line-through"
              )}
            >
              {next.title}
            </span>
            {cancelled ? <StatusBadge status={next.status} /> : null}
          </div>
          {cancelled && isToday ? (
            <span className="text-sm font-medium text-destructive">{t("cancelledToday")}</span>
          ) : (
            <EventDetails event={next} />
          )}
        </Link>
      </CardContent>
    </Card>
  )
}

/** The few Events after the next one, each linking to its page. Renders nothing when there are none. */
export async function ComingUpCard({ className }: { className?: string }) {
  const [{ events, today }, t] = await Promise.all([upcomingForHome(), getTranslations("HomePage.events")])
  const later = events.slice(1, 1 + COMING_UP)
  if (later.length === 0) return null

  return (
    <OverviewCard title={t("comingUp")} link={{ href: ROUTES.events, label: t("seeAll") }} className={className}>
      <OverviewList>
        {later.map((event) => (
          <li key={event.id}>
            <ComingUpRow event={event} today={happensOn(event, today)} />
          </li>
        ))}
      </OverviewList>
    </OverviewCard>
  )
}

async function ComingUpRow({ event, today }: { event: UpcomingEvent; today: boolean }) {
  const [t, format] = await Promise.all([getTranslations("HomePage.events"), getFormatter()])
  const cancelled = event.status === "Cancelled"
  const time = event.allDay ? t("allDay") : format.dateTime(event.startsAt, { timeStyle: "short" })
  const day = today ? t("today") : format.dateTime(event.startsAt, { weekday: "short", day: "numeric", month: "short" })

  return (
    <Link href={eventPath(event.id)} className={overviewRowClassName}>
      <time
        dateTime={event.startsAt.toISOString()}
        className="flex w-20 shrink-0 flex-col text-sm tabular-nums text-muted-foreground"
      >
        <span className="font-medium text-foreground">{day}</span>
        <span>{time}</span>
      </time>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium break-words", cancelled && "text-muted-foreground line-through")}>
            {event.title}
          </span>
          {cancelled ? <StatusBadge status={event.status} /> : null}
        </div>
        {cancelled && today ? (
          <span className="text-sm font-medium text-destructive">{t("cancelledToday")}</span>
        ) : (
          <EventDetails event={event} />
        )}
      </div>
    </Link>
  )
}

function EventDetails({ event }: { event: UpcomingEvent }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
      <span>
        <EventKind type={event.type} rehearsalKind={event.rehearsalKind} />
      </span>
      {event.location ? <span className="break-words">{event.location}</span> : null}
    </span>
  )
}
