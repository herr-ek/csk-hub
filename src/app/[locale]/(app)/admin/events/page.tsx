import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { EventsScreen, EventsScreenSkeleton } from "@/features/events"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function AdminEvents({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ action: "event.administer" })

  return <EventsScreen searchParams={await searchParams} />
}

export default function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<EventsScreenSkeleton />}>
      <AdminEvents searchParams={searchParams} />
    </Suspense>
  )
}
