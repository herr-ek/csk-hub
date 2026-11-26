import Form from "next/form"
import Link from "next/link"
import { Suspense } from "react"
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
import { Input } from "@/shared/ui/base/input"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { UnpublishedNotice } from "./compose/UnpublishedNotice"
import { NewsSearchButton, Reveal } from "./news-motion"
import { PostAudience } from "./PostAudience"
import { PostTime } from "./PostTime"
import { PostByline } from "./post-byline"
import { listNewsFeed, listOwnDrafts, NEWS_FEED_PAGE_SIZE, searchNewsFeed } from "./service"
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
        {t("unpublishedPosts")}
      </h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <Link
              href={newsPostEditPath(draft.id)}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              <span className="font-medium break-words">
                {draft.title}
                {draft.recalled ? <span className="ml-2 text-sm text-muted-foreground">{t("recalled")}</span> : null}
              </span>
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

export async function NewsScreen({
  searchParams
}: {
  searchParams: Promise<{ query?: string | string[]; page?: string | string[] }>
}) {
  const params = await searchParams
  const query = typeof params.query === "string" ? params.query.trim() : ""
  const page = typeof params.page === "string" ? Number(params.page) : 1
  const [{ entries, pages, hasMore }, unread, canPublish, t] = await Promise.all([
    query ? searchNewsFeed(query, page) : listNewsFeed(page),
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
      {canPublish ? (
        <Suspense fallback={null}>
          <UnpublishedNotice />
        </Suspense>
      ) : null}

      <Form action={ROUTES.news} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="news-search" className="mb-2 block text-sm font-medium">
            {t("searchLabel")}
          </label>
          <Input
            id="news-search"
            name="query"
            type="search"
            maxLength={200}
            defaultValue={query}
            key={query}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <NewsSearchButton />
        {query ? (
          <Link href={ROUTES.news} className={buttonVariants({ variant: "outline" })}>
            {t("clearSearch")}
          </Link>
        ) : null}
      </Form>

      {entries.length === 0 ? (
        // Keyed by the query, so a second search with no matches visibly answers again.
        <Reveal key={query}>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t(query ? "noResultsTitle" : "emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t(query ? "noResultsDescription" : "emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Reveal>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry, index) => {
            const isUnread = unread.has(entry.id)
            return (
              <li key={entry.id}>
                <Reveal order={index % NEWS_FEED_PAGE_SIZE}>
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
                            publisherName={entry.publisherName}
                            showAuthor={entry.showAuthor}
                            lastEditorName={entry.lastEditorName}
                            lastEditorRecorded={entry.lastEditorRecorded}
                            authorName={entry.authorName}
                            publishedAt={entry.publishedAt}
                            editedAt={entry.editedAt}
                          />
                        </CardDescription>
                        <PostAudience audienceAll={entry.audienceAll} targets={entry.targets} />
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
                </Reveal>
              </li>
            )
          })}
        </ul>
      )}
      {hasMore ? (
        <Link
          href={`${ROUTES.news}?${new URLSearchParams({ ...(query ? { query } : {}), page: String(pages + 1) })}`}
          scroll={false}
          className={cn(buttonVariants({ variant: "outline" }), "self-center")}
        >
          {t("loadMore")}
        </Link>
      ) : null}
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
