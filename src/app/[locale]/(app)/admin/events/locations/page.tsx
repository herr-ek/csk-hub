import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { LocationsScreen, LocationsScreenSkeleton } from "@/features/events"

async function AdminEventLocations() {
  await requirePermission({ action: "event.administer" })

  return <LocationsScreen />
}

export default function AdminEventLocationsPage() {
  return (
    <Suspense fallback={<LocationsScreenSkeleton />}>
      <AdminEventLocations />
    </Suspense>
  )
}
