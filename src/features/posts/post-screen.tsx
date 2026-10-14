import { notFound } from "next/navigation"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { RichTextContent } from "@/features/rich-text/view"
import { ContentPage } from "@/shared/layouts/content-page"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PostByline } from "./post-byline"
import { getPublishedPost } from "./service"

export async function PostScreen({ postId }: { postId: string }) {
  const post = await getPublishedPost(postId)

  if (!post) notFound()

  return (
    <ContentPage>
      <PageBreadcrumb route="news" current={post.title} />
      <article className="flex flex-col gap-4">
        <header>
          <h1 className="font-heading text-2xl font-semibold break-words">{post.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <PostByline authorName={post.authorName} publishedAt={post.publishedAt} />
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
