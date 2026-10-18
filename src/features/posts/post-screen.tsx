import Link from "next/link"
import { notFound } from "next/navigation"
import { canCurrentUser } from "@/core/auth/permissions.server"
import { getTranslations } from "@/core/i18n/server"
import { newsPostEditPath } from "@/core/navigation/navigation-utils"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { RichTextContent } from "@/features/rich-text/view"
import { ContentPage } from "@/shared/layouts/content-page"
import { buttonVariants } from "@/shared/ui/base/button"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { unpublishPost } from "./compose/actions"
import { ConfirmPostCommand } from "./compose/ConfirmPostCommand"
import { PostByline } from "./post-byline"
import { getPublishedPost } from "./service"

/** Changing a published Post, offered only to whoever may make the change. */
async function PostControls({ postId }: { postId: string }) {
  const [canChange, t] = await Promise.all([
    canCurrentUser({ resource: "post", action: "update" }),
    getTranslations("Posts")
  ])
  if (!canChange) return null

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={newsPostEditPath(postId)} // `cn` settles the base border against the outline one, as `Button` does.
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        {t("editPost")}
      </Link>
      <ConfirmPostCommand command="unpublish" action={unpublishPost.bind(null, postId)} />
    </div>
  )
}

export async function PostScreen({ postId }: { postId: string }) {
  const post = await getPublishedPost(postId)

  if (!post) notFound()

  return (
    <ContentPage>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lets a long title truncate instead of pushing the controls off the row. */}
        <div className="min-w-0">
          <PageBreadcrumb route="news" current={post.title} />
        </div>
        <PostControls postId={post.id} />
      </div>
      <article className="flex flex-col gap-4">
        <header>
          <h1 className="font-heading text-2xl font-semibold break-words">{post.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <PostByline authorName={post.authorName} publishedAt={post.publishedAt} editedAt={post.editedAt} />
          </p>
        </header>
        <RichTextContent document={post.body} />
      </article>
    </ContentPage>
  )
}

export function PostScreenSkeleton() {
  return (
    <ContentPage busy>
      <PageBreadcrumb route="news" current={<Skeleton className="h-4 w-32" />} />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-48" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </ContentPage>
  )
}
