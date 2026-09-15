import { Suspense } from "react"
import { NewsPageTransition, NewsScreen, NewsScreenSkeleton } from "@/features/posts"

export default function NewsPage() {
  return (
    <NewsPageTransition>
      <Suspense fallback={<NewsScreenSkeleton />}>
        <NewsScreen />
      </Suspense>
    </NewsPageTransition>
  )
}
