import { io } from "next/cache"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { RichTextContent } from "@/features/rich-text/view"
import { ContentPage } from "@/shared/layouts/content-page"
import { Badge } from "@/shared/ui/base/badge"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { answersFor, stockholmInstant } from "../model"
import { eventManagementPath } from "../ui/command-state"
import { StatusBadge } from "../ui/StatusBadge"
import { eventDays } from "./days"
import { EventKind } from "./EventKind"
import { type EventPage, getCurrentEventPage } from "./query"
import { ResponseBar } from "./ResponseBar"

/**
 * One Event as its Audience reads it. Anything the viewer may not see, including every Draft, is
 * answered as a missing page.
 */
export async function EventPageScreen({ eventId }: { eventId: string }) {
  await io()
  const [page, t] = await Promise.all([
    getCurrentEventPage(eventId, new Date()),
    getTranslations("Events.calendar.page")
  ])
  if (!page) notFound()

  return (
    <ContentPage>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lets a long title truncate instead of pushing the edit link off the row. */}
        <div className="min-w-0">
          <PageBreadcrumb route="events" current={page.title} />
        </div>
        {page.canManage ? (
          <Link href={eventManagementPath(page.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("edit")}
          </Link>
        ) : null}
      </div>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-semibold break-words">
            <span className={page.status === "Cancelled" ? "text-muted-foreground line-through" : undefined}>
              {page.title}
            </span>
            {page.status === "Cancelled" ? <StatusBadge status={page.status} /> : null}
          </h1>
          <div>
            <Badge variant="outline">
              <EventKind type={page.type} rehearsalKind={page.rehearsalKind} />
            </Badge>
          </div>
        </header>
        {page.responses ? <ResponseRow eventId={page.id} responses={page.responses} /> : null}
        <EventFacts page={page} />
        {page.description ? <RichTextContent document={page.description} /> : null}
        {page.responses?.summary ? (
          <ResponseSummary mode={page.responses.mode} summary={page.responses.summary} />
        ) : null}
      </article>
    </ContentPage>
  )
}

async function EventFacts({ page }: { page: EventPage }) {
  const [t, format, audience] = await Promise.all([
    getTranslations("Events.calendar.page"),
    getFormatter(),
    describeAudience(page.targets)
  ])
  const { firstDay, lastDay } = eventDays(page)
  const when = page.allDay
    ? format.dateTimeRange(stockholmInstant(firstDay) as Date, stockholmInstant(lastDay) as Date, {
        dateStyle: "full"
      })
    : format.dateTimeRange(page.startsAt, page.endsAt, { dateStyle: "full", timeStyle: "short" })
  const place = page.locationText ?? page.location?.name

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
      <Fact label={t("when")}>
        <time dateTime={page.startsAt.toISOString()}>{when}</time>
      </Fact>
      {page.callTime ? (
        <Fact label={t("callTime")}>
          <time dateTime={page.callTime.toISOString()}>{format.dateTime(page.callTime, { timeStyle: "short" })}</time>
        </Fact>
      ) : null}
      {place ? (
        <Fact label={t("where")}>
          <span className="flex flex-col gap-0.5">
            <span>{place}</span>
            {page.location?.address ? <span className="text-muted-foreground">{page.location.address}</span> : null}
            {page.location?.mapUrl ? (
              <a
                href={page.location.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit underline underline-offset-4"
              >
                {t("openMap")}
              </a>
            ) : null}
          </span>
        </Fact>
      ) : null}
      {page.organiserGroup ? <Fact label={t("organiser")}>{page.organiserGroup}</Fact> : null}
      <Fact label={t("audience")}>{audience}</Fact>
      {page.leaderName ? <Fact label={t("leader")}>{page.leaderName}</Fact> : null}
      {page.responsibleName ? <Fact label={t("responsible")}>{page.responsibleName}</Fact> : null}
      {page.costInfo ? <Fact label={t("cost")}>{page.costInfo}</Fact> : null}
      {page.details.map(({ label, value }, index) => (
        // Labels may repeat, so their place in the order is the key.
        <Fact key={index} label={label}>
          {value}
        </Fact>
      ))}
    </dl>
  )
}

type PageResponses = NonNullable<EventPage["responses"]>

/** Answering the Event, first on the page, on one line; after the start, only the answer. */
async function ResponseRow({ eventId, responses }: { eventId: string; responses: PageResponses }) {
  const { own, canRespond } = responses
  if (!canRespond && !own) return null
  const [t, format] = await Promise.all([getTranslations("Events.respond"), getFormatter()])
  const deadline = responses.respondBy
    ? t("respondBy", { deadline: format.dateTime(responses.respondBy, { dateStyle: "medium", timeStyle: "short" }) })
    : null

  return (
    <section className="rounded-xl border bg-card px-4 py-3 text-sm">
      {canRespond ? (
        <ResponseBar
          eventId={eventId}
          mode={responses.mode}
          reasons={responses.reasons}
          own={own}
          deadline={deadline}
        />
      ) : own ? (
        // Once the Event has started, or is cancelled, the answer is only shown.
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {t(`answered.${own.answer}`)}
          {own.late ? <Badge variant="destructive">{t("late")}</Badge> : null}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Who has answered what, last on the page, when the read lets the viewer see it: on a Rehearsal
 * only its managers do. Names only: comments and reasons are for the User and the organisers,
 * and the page never reads anyone else's.
 */
async function ResponseSummary({
  mode,
  summary
}: {
  mode: PageResponses["mode"]
  summary: NonNullable<PageResponses["summary"]>
}) {
  const [t, answers, format] = await Promise.all([
    getTranslations("Events.respond"),
    getTranslations("Events.answers"),
    getFormatter()
  ])
  const { byAnswer } = summary
  // Maybe stays listed if it was given before the mode became strict.
  const shown = (["Yes", "No", "Maybe"] as const).filter(
    (answer) => answersFor(mode).includes(answer) || byAnswer[answer].length > 0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {shown.map((answer) => (
            <Fact key={answer} label={t("answerCount", { answer: answers(answer), count: byAnswer[answer].length })}>
              {byAnswer[answer].length > 0 ? format.list(byAnswer[answer]) : t("nobody")}
            </Fact>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">{t("notAnswered", { count: summary.notAnswered })}</p>
      </CardContent>
    </Card>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-line">{children}</dd>
    </div>
  )
}

/** Who the Event is for, in words: "KK", "Basses in KK", "Everyone in CSK". */
async function describeAudience(targets: EventPage["targets"]) {
  const [t, format] = await Promise.all([getTranslations("Events.calendar"), getFormatter()])
  if (targets.length === 0) return t("everyoneInCsk")
  const words = targets.map(({ groupName, voiceFamily }) => {
    if (!voiceFamily) return groupName ?? ""
    const voices = t(`voiceFamilies.${voiceFamily}`)
    return groupName ? t("voiceInGroup", { voices, group: groupName }) : t("voiceInCsk", { voices })
  })
  return format.list(words)
}

export function EventPageScreenSkeleton() {
  return (
    <ContentPage busy>
      <PageBreadcrumb route="events" current={<Skeleton className="h-4 w-32" />} />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </ContentPage>
  )
}
