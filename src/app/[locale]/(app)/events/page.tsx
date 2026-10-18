import { Suspense } from "react"
import { UpcomingEventsScreen, UpcomingEventsScreenSkeleton } from "@/features/events"

export default function EventsPage() {
  return (
    <Suspense fallback={<UpcomingEventsScreenSkeleton />}>
      <UpcomingEventsScreen />
    </Suspense>
  )
}
