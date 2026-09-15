import Link from "next/link"
import { Suspense, ViewTransition } from "react"
import { canCurrentUser } from "@/core/auth/permissions.server"
import { getTranslations } from "@/core/i18n/server"
import { useTranslations } from "@/core/i18n/translations"
import { newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { ContentPage } from "@/shared/layouts/content-page"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/base/empty"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PostByline } from "./post-byline"
import { listNewsFeed } from "./service"

function NewsHeader({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("Posts")
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {children}
    </div>
  )
}

async function PublishPostLink() {
  const [canPublish, t] = await Promise.all([
    canCurrentUser({ resource: "post", action: "create" }),
    getTranslations("Posts")
  ])

  return canPublish ? (
    <Link href={ROUTES.newsCompose} transitionTypes={["nav-forward"]} className={buttonVariants()}>
      {t("writePost")}
    </Link>
  ) : null
}

export async function NewsScreen() {
  const [entries, t] = await Promise.all([listNewsFeed(), getTranslations("Posts")])

  return (
    <ContentPage>
      <NewsHeader>
        <Suspense fallback={null}>
          <ViewTransition enter="content-reveal" default="none">
            <PublishPostLink />
          </ViewTransition>
        </Suspense>
      </NewsHeader>

      <ViewTransition update="auto" default="none">
        {entries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <ViewTransition key={entry.id} update="auto" default="none">
                <li>
                  <Link
                    href={newsPostPath(entry.id)}
                    prefetch={true}
                    transitionTypes={["nav-forward"]}
                    className="group block focus-visible:outline-none"
                  >
                    <Card className="transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                      <CardHeader>
                        <ViewTransition name={`news-post-title-${entry.id}`} share="morph" default="none">
                          <CardTitle className="text-lg break-words">{entry.title}</CardTitle>
                        </ViewTransition>
                        <ViewTransition name={`news-post-byline-${entry.id}`} share="text-morph" default="none">
                          <CardDescription>
                            <PostByline authorName={entry.authorName} publishedAt={entry.publishedAt} />
                          </CardDescription>
                        </ViewTransition>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              </ViewTransition>
            ))}
          </ul>
        )}
      </ViewTransition>
    </ContentPage>
  )
}

export function NewsScreenSkeleton() {
  return (
    <ContentPage busy>
      <NewsHeader />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </ContentPage>
  )
}
