import Link from "next/link"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { eventPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard, OverviewList, overviewRowClassName } from "@/shared/layouts/overview-card"
import { cn } from "@/shared/utils"
import { stockholmDate } from "../model"
import { StatusBadge } from "../ui/StatusBadge"
import { happensOn } from "./days"
import { EventKind } from "./EventKind"
import { listUpcomingEventsForUser, type UpcomingEvent } from "./query"

/** How many Events the card lists in all, today's included. */
const NEXT_UP = 5

/**
 * The signed-in User's next few Events for an overview page. Events happening today, ongoing ones
 * included, are called out first, so a Cancelled rehearsal tonight cannot be missed.
 */
export async function NextEventsCard({ className }: { className?: string }) {
  const userId = await requireAuthenticatedUser()
  const now = new Date()
  const [{ events, inChoir }, t] = await Promise.all([
    listUpcomingEventsForUser(db, userId, now),
    getTranslations("HomePage.events")
  ])
  const today = stockholmDate(now)
  const todays = events.filter((event) => happensOn(event, today))
  const later = events.filter((event) => !happensOn(event, today)).slice(0, Math.max(NEXT_UP - todays.length, 2))

  return (
    <OverviewCard title={t("title")} link={{ href: ROUTES.events, label: t("seeAll") }} className={className}>
      {todays.length ? (
        <section aria-labelledby="events-today" className="flex flex-col gap-2 rounded-2xl bg-primary/5 p-3">
          <h3 id="events-today" className="text-xs font-semibold tracking-wide text-primary uppercase">
            {t("today")}
          </h3>
          <ul className="-mx-2 flex flex-col">
            {todays.map((event) => (
              <li key={event.id}>
                <NextEventRow event={event} today />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {later.length ? (
        <section aria-labelledby={todays.length ? "events-later" : undefined} className="flex flex-col gap-1">
          {todays.length ? (
            <h3 id="events-later" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("comingUp")}
            </h3>
          ) : null}
          <OverviewList>
            {later.map((event) => (
              <li key={event.id}>
                <NextEventRow event={event} />
              </li>
            ))}
          </OverviewList>
        </section>
      ) : null}
      {events.length === 0 ? <p className="text-sm text-muted-foreground">{t(inChoir ? "empty" : "noChoir")}</p> : null}
    </OverviewCard>
  )
}

async function NextEventRow({ event, today = false }: { event: UpcomingEvent; today?: boolean }) {
  const [t, format] = await Promise.all([getTranslations("HomePage.events"), getFormatter()])
  const cancelled = event.status === "Cancelled"
  const time = event.allDay ? t("allDay") : format.dateTime(event.startsAt, { timeStyle: "short" })
  const day = format.dateTime(event.startsAt, { weekday: "short", day: "numeric", month: "short" })

  return (
    <Link href={eventPath(event.id)} className={overviewRowClassName}>
      <time
        dateTime={event.startsAt.toISOString()}
        className="flex w-20 shrink-0 flex-col text-sm tabular-nums text-muted-foreground"
      >
        {today ? null : <span className="font-medium text-foreground">{day}</span>}
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
          <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span>
              <EventKind type={event.type} rehearsalKind={event.rehearsalKind} />
            </span>
            {event.location ? <span className="break-words">{event.location}</span> : null}
          </span>
        )}
      </div>
    </Link>
  )
}
