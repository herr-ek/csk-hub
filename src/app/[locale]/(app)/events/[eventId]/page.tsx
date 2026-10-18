import { Suspense } from "react"
import { EventPageScreen, EventPageScreenSkeleton } from "@/features/events"

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<EventPageScreenSkeleton />}>
      {params.then(({ eventId }) => (
        <EventPageScreen eventId={eventId} />
      ))}
    </Suspense>
  )
}
