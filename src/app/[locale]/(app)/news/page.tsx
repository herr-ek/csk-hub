import { Suspense } from "react"
import { NewsScreen, NewsScreenSkeleton } from "@/features/posts"

export default function NewsPage() {
  return (
    <Suspense fallback={<NewsScreenSkeleton />}>
      <NewsScreen />
    </Suspense>
  )
}
