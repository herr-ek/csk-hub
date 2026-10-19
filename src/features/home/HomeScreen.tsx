import { Suspense } from "react"
import { getRequestSession } from "@/core/auth/session.server"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { DraftEventsCard, NextEventsCard } from "@/features/events"
import { WhereISingCard } from "@/features/members"
import { UnreadConversationsCard } from "@/features/messaging"
import { LatestPostsCard, PostDraftsCard } from "@/features/posts"
import { ContentPage } from "@/shared/layouts/content-page"
import { OverviewCardSkeleton } from "@/shared/layouts/overview-card"
import { Skeleton } from "@/shared/ui/base/skeleton"

const WIDE = "md:col-span-2"

/**
 * The signed-in home page: what matters to the User right now, most urgent first, each card
 * linking on to its full page. Every card loads under its own boundary, so a slow read never
 * holds up the rest; cards for those who manage things render nothing for everyone else.
 */
export function HomeScreen() {
  return (
    <ContentPage>
      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />
      </Suspense>
      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<OverviewCardSkeleton rows={4} className={WIDE} />}>
          <NextEventsCard className={WIDE} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton rows={2} />}>
          <UnreadConversationsCard />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton rows={2} />}>
          <WhereISingCard />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton className={WIDE} />}>
          <LatestPostsCard className={WIDE} />
        </Suspense>
        <Suspense fallback={null}>
          <DraftEventsCard />
        </Suspense>
        <Suspense fallback={null}>
          <PostDraftsCard />
        </Suspense>
      </div>
    </ContentPage>
  )
}

async function Greeting() {
  const [session, t, format] = await Promise.all([getRequestSession(), getTranslations("HomePage"), getFormatter()])
  const firstName = session?.user.name.trim().split(/\s+/)[0]

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        {firstName ? t("greeting", { name: firstName }) : t("greetingAnonymous")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">
        {format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" })}
      </p>
    </div>
  )
}

function GreetingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  )
}
