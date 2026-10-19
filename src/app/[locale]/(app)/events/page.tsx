import { Suspense } from "react"
import { UpcomingEventsScreen, UpcomingEventsScreenSkeleton } from "@/features/events"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function UpcomingEvents({ searchParams }: { searchParams: SearchParams }) {
  return <UpcomingEventsScreen searchParams={await searchParams} />
}

export default function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<UpcomingEventsScreenSkeleton />}>
      <UpcomingEvents searchParams={searchParams} />
    </Suspense>
  )
}
