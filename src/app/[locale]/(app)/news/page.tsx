import { Suspense } from "react"
import { NewsScreen, NewsScreenSkeleton } from "@/features/posts"

export default function NewsPage({
  searchParams
}: {
  searchParams: Promise<{ query?: string | string[]; page?: string | string[] }>
}) {
  return (
    <Suspense fallback={<NewsScreenSkeleton />}>
      <NewsScreen searchParams={searchParams} />
    </Suspense>
  )
}
