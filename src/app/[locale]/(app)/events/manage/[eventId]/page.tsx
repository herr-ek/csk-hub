import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"
import { EventScreen, EventScreenSkeleton } from "@/features/events"

async function EventDetail({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!z.uuid().safeParse(eventId).success) notFound()
  return <EventScreen eventId={eventId} />
}

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<EventScreenSkeleton />}>
      <EventDetail params={params} />
    </Suspense>
  )
}
