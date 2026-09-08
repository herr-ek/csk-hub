import { Suspense } from "react"
import { PostScreen, PostScreenSkeleton } from "@/features/posts"

export default async function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <Suspense fallback={<PostScreenSkeleton />}>
      <PostScreen postId={id} />
    </Suspense>
  )
}
