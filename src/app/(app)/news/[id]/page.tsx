import { Suspense } from "react"
import { PostScreen, PostScreenSkeleton } from "@/features/posts"

export default function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PostScreenSkeleton />}>
      <PostScreen params={params} />
    </Suspense>
  )
}
