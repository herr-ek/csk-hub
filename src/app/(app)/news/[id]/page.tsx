import { Suspense } from "react"
import { PostScreen, PostScreenSkeleton } from "@/features/posts"

export default function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrapped inside the boundary, not awaited at the top: `cacheComponents` needs the
  // shell to prerender without the id. The screen still takes a plain `postId`.
  return (
    <Suspense fallback={<PostScreenSkeleton />}>
      {params.then(({ id }) => (
        <PostScreen postId={id} />
      ))}
    </Suspense>
  )
}
