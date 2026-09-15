import { Suspense } from "react"
import { MessagesScreen, MessagesScreenSkeleton } from "@/features/messaging"

export default function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  return (
    <Suspense fallback={<MessagesScreenSkeleton />}>
      <MessagesPageContent searchParams={searchParams} />
    </Suspense>
  )
}

async function MessagesPageContent({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q = "" } = await searchParams
  const query = Array.isArray(q) ? (q[0] ?? "") : q
  return <MessagesScreen query={query} />
}
