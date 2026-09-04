import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ROUTES } from "@/core/navigation/site"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PublishedAt } from "./published-at"
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

export async function PostScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await getPublishedPost(id)

  if (!post) notFound()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <BackToNews />
      <article className="flex flex-col gap-4">
        <header>
          <h1 className="font-heading text-2xl font-semibold break-words">{post.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {post.authorName} · <PublishedAt date={post.publishedAt} />
          </p>
        </header>
        <div className="whitespace-pre-wrap break-words text-base leading-relaxed">{post.body}</div>
      </article>
    </main>
  )
}

export function PostScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
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
    </main>
  )
}
