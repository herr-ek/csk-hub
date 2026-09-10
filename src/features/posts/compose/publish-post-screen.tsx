import { connection } from "next/server"
import { Suspense } from "react"
import { ContentPage } from "@/shared/layouts/content-page"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PublishPostForm } from "./publish-post-form"

function ComposeHeader() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Write a post</h1>
      <p className="mt-1 text-sm text-muted-foreground">Publishing shows the post to every member right away.</p>
    </div>
  )
}

/**
 * Tiptap gives each editor instance an id from `Math.random()` as it is constructed,
 * which a prerendered shell would freeze into the build. Deferring the form to request
 * time is the right shape regardless: only an Admin ever reaches this screen, and the
 * heading above it is the only part of it worth prerendering.
 */
async function PostComposer() {
  await connection()
  return <PublishPostForm />
}

function PostComposerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-10 w-full rounded-b-none" />
        <Skeleton className="h-56 w-full rounded-t-none" />
      </div>
      <Skeleton className="h-9 w-24" />
    </div>
  )
}

/**
 * The screen for publishing a post. It contains the form and some explanatory text.
 */
export function PublishPostScreen() {
  return (
    <ContentPage>
      <ComposeHeader />
      <Suspense fallback={<PostComposerSkeleton />}>
        <PostComposer />
      </Suspense>
    </ContentPage>
  )
}
