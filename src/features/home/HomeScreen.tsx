import Link from "next/link"
import { Suspense } from "react"
import { getRequestSession } from "@/core/auth/session.server"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { ComingUpCard, NextEventCard } from "@/features/events"
import { LatestPostsCard } from "@/features/posts"
import { ContentPage } from "@/shared/layouts/content-page"
import { OverviewCardSkeleton } from "@/shared/layouts/overview-card"
import { Skeleton } from "@/shared/ui/base/skeleton"

const WIDE = "md:col-span-2"

/**
 * The signed-in home page: a greeting, the User's next Event across the top, then
 * what's coming up beside the latest News, each card linking on to its full page. Every card loads
 * under its own boundary, so a slow read never holds up the rest.
 */
export async function HomeScreen() {
  const info = await getTranslations("Public.info")

  return (
    <ContentPage>
      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />
      </Suspense>
      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<OverviewCardSkeleton rows={1} className={WIDE} />}>
          <NextEventCard className={WIDE} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton rows={4} />}>
          <ComingUpCard />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton />}>
          <LatestPostsCard />
        </Suspense>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <Link href={ROUTES.privacy} className="underline underline-offset-4">
          {info("privacyTitle")}
        </Link>
        <Link href={ROUTES.support} className="underline underline-offset-4">
          {info("supportTitle")}
        </Link>
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
