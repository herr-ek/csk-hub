import { Suspense } from "react"
import { NewsPageTransition, PostScreen, PostScreenSkeleton } from "@/features/posts"

export default function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <NewsPageTransition>
      <Suspense fallback={<PostScreenSkeleton />}>
        {params.then(({ id }) => (
          <PostScreen postId={id} />
        ))}
      </Suspense>
    </NewsPageTransition>
  )
}
