import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { NewEventScreen, NewEventScreenSkeleton } from "@/features/events"

async function AdminNewEvent() {
  await requirePermission({ action: "event.administer" })

  return <NewEventScreen />
}

export default function AdminNewEventPage() {
  return (
    <Suspense fallback={<NewEventScreenSkeleton />}>
      <AdminNewEvent />
    </Suspense>
  )
}
