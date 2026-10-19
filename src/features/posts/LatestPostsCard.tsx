import Link from "next/link"
import { canCurrentUser } from "@/core/auth/permissions.server"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { getTranslations } from "@/core/i18n/server"
import { newsPostEditPath, newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard, OverviewList, overviewRowClassName } from "@/shared/layouts/overview-card"
import { PostTime } from "./PostTime"
import { PostByline } from "./post-byline"
import { listDraftsByAuthor, listLatestPosts } from "./service"

const LATEST = 3

/** The newest few Posts for an overview page, each by title and byline. */
export async function LatestPostsCard({ className }: { className?: string }) {
  const [posts, t] = await Promise.all([listLatestPosts(LATEST), getTranslations("HomePage.news")])

  return (
    <OverviewCard title={t("title")} link={{ href: ROUTES.news, label: t("seeAll") }} className={className}>
      {posts.length ? (
        <OverviewList>
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={newsPostPath(post.id)} className={`${overviewRowClassName} flex-col gap-0.5`}>
                <span className="font-medium break-words">{post.title}</span>
                <span className="text-sm text-muted-foreground">
                  <PostByline authorName={post.authorName} publishedAt={post.publishedAt} editedAt={null} />
                </span>
              </Link>
            </li>
          ))}
        </OverviewList>
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
    </OverviewCard>
  )
}

/**
 * The reader's own unpublished Posts, for an overview page. Renders nothing for a User who may not
 * publish, or who has no drafts. Nobody else's drafts are ever shown.
 */
export async function PostDraftsCard({ className }: { className?: string }) {
  if (!(await canCurrentUser({ resource: "post", action: "create" }))) return null
  const [drafts, t] = await Promise.all([
    requireAuthenticatedUser().then((authorId) => listDraftsByAuthor(authorId)),
    getTranslations("HomePage.postDrafts")
  ])
  if (drafts.length === 0) return null

  return (
    <OverviewCard
      title={t("title", { count: drafts.length })}
      link={{ href: ROUTES.news, label: t("seeAll") }}
      className={className}
    >
      <OverviewList>
        {drafts.slice(0, LATEST).map((draft) => (
          <li key={draft.id}>
            <Link href={newsPostEditPath(draft.id)} className={`${overviewRowClassName} flex-col gap-0.5`}>
              <span className="font-medium break-words">{draft.title}</span>
              <span className="text-sm text-muted-foreground">
                {t("saved")} <PostTime date={draft.savedAt} />
              </span>
            </Link>
          </li>
        ))}
      </OverviewList>
    </OverviewCard>
  )
}
