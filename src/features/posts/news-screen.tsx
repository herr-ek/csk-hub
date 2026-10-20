import Link from "next/link"
import { getRequestSession } from "@/core/auth/session.server"
import { can } from "@/core/authz"
import { getTranslations } from "@/core/i18n/server"
import { useTranslations } from "@/core/i18n/translations"
import { newsPostEditPath, newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { RichTextContent } from "@/features/rich-text/view"
import { ContentPage } from "@/shared/layouts/content-page"
import { Badge } from "@/shared/ui/base/badge"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/base/empty"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { PostTime } from "./PostTime"
import { PostByline } from "./post-byline"
import { listNewsFeed, listOwnDrafts } from "./service"
import { listUnreadPostIds } from "./unread"

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

/** The reader's own unpublished Posts. Nobody else's drafts are ever shown here. */
async function OwnDrafts() {
  const [drafts, t] = await Promise.all([listOwnDrafts(), getTranslations("Posts")])
  if (drafts.length === 0) return null

  return (
    <section aria-labelledby="own-drafts" className="flex flex-col gap-2">
      <h2 id="own-drafts" className="text-sm font-medium text-muted-foreground">
        {t("yourDrafts")}
      </h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <Link
              href={newsPostEditPath(draft.id)}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              <span className="font-medium break-words">{draft.title}</span>
              <span className="text-sm text-muted-foreground">
                {t("draftSaved")} <PostTime date={draft.savedAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

async function listUnreadForCurrentUser() {
  const session = await getRequestSession()
  return session ? listUnreadPostIds(session.user.id) : new Set<string>()
}

export async function NewsScreen() {
  const [entries, unread, canPublish, t] = await Promise.all([
    listNewsFeed(),
    listUnreadForCurrentUser(),
    can({ action: "post.create" }),
    getTranslations("Posts")
  ])

  return (
    <ContentPage>
      <NewsHeader>
        {canPublish ? (
          <Link href={ROUTES.newsCompose} className={buttonVariants()}>
            {t("writePost")}
          </Link>
        ) : null}
      </NewsHeader>

      {canPublish ? <OwnDrafts /> : null}

      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const isUnread = unread.has(entry.id)
            return (
              <li key={entry.id}>
                <Link href={newsPostPath(entry.id)} className="group block focus-visible:outline-none">
                  <Card className="transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    <CardHeader>
                      <CardTitle className={cn("text-lg break-words", isUnread && "font-semibold")}>
                        {entry.title}
                      </CardTitle>
                      {isUnread ? (
                        <CardAction>
                          <Badge>{t("unread")}</Badge>
                        </CardAction>
                      ) : null}
                      <CardDescription>
                        <PostByline
                          authorName={entry.authorName}
                          publishedAt={entry.publishedAt}
                          editedAt={entry.editedAt}
                        />
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RichTextContent
                        document={entry.body}
                        linksAsText
                        className="max-h-24 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
                      />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
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
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </CardContent>
          </Card>
        ))}
      </div>
    </ContentPage>
  )
}
