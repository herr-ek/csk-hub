import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"
import { requirePermission } from "@/core/authz"
import { EventScreen, EventScreenSkeleton } from "@/features/events"

const eventIdSchema = z.uuid()

export default function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<EventScreenSkeleton />}>
      <AdminEvent params={params} />
    </Suspense>
  )
}

async function AdminEvent({ params }: { params: Promise<{ eventId: string }> }) {
  // Authorize before validating the address, so non-Admins get the same response for any Event.
  await requirePermission({ action: "event.administer" })
  const { eventId } = await params
  if (!eventIdSchema.safeParse(eventId).success) notFound()

  return <EventScreen eventId={eventId} />
}
