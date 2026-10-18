import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { EventsScreen, EventsScreenSkeleton } from "@/features/events"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function AdminEvents({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin()

  return <EventsScreen searchParams={await searchParams} />
}

export default function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<EventsScreenSkeleton />}>
      <AdminEvents searchParams={searchParams} />
    </Suspense>
  )
}
