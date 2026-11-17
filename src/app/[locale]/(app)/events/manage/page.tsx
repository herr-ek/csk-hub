import { Suspense } from "react"
import { EventsScreen, EventsScreenSkeleton } from "@/features/events"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function EventList({ searchParams }: { searchParams: SearchParams }) {
  return <EventsScreen searchParams={await searchParams} />
}

export default function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<EventsScreenSkeleton />}>
      <EventList searchParams={searchParams} />
    </Suspense>
  )
}
