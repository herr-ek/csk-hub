import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ROUTES } from "@/core/navigation/site"
import { ContentPage } from "@/shared/layouts/content-page"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PostContent } from "./markdown"
import { PostByline } from "./post-byline"
import { getPublishedPost } from "./service"

function BackToNews() {
  return (
    <Link
      href={ROUTES.news}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      All news
    </Link>
  )
}

export async function PostScreen({ postId }: { postId: string }) {
  const post = await getPublishedPost(postId)

  if (!post) notFound()

  return (
    <ContentPage>
      <BackToNews />
      <article className="flex flex-col gap-4">
        <header>
          <h1 className="font-heading text-2xl font-semibold break-words">{post.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <PostByline authorName={post.authorName} publishedAt={post.publishedAt} />
          </p>
        </header>
        <PostContent markdown={post.body} />
      </article>
    </ContentPage>
  )
}

export function PostScreenSkeleton() {
  return (
    <ContentPage busy>
      <BackToNews />
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
