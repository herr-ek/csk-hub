import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard, OverviewList, overviewRowClassName } from "@/shared/layouts/overview-card"
import { PostByline } from "./post-byline"
import { listLatestPosts } from "./service"

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
