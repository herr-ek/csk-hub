import { Suspense } from "react"
import { PublishPostScreen, PublishPostScreenSkeleton } from "@/features/posts"

export default function PublishPostPage() {
  return (
    <Suspense fallback={<PublishPostScreenSkeleton />}>
      <PublishPostScreen />
    </Suspense>
  )
}
