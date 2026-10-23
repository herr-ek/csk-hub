import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { NewEventScreen, NewEventScreenSkeleton } from "@/features/events"

async function AdminNewEvent() {
  await requireAdmin()

  return <NewEventScreen />
}

export default function AdminNewEventPage() {
  return (
    <Suspense fallback={<NewEventScreenSkeleton />}>
      <AdminNewEvent />
    </Suspense>
  )
}
