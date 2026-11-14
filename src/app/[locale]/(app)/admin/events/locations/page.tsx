import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { LocationsScreen, LocationsScreenSkeleton } from "@/features/events"

async function AdminEventLocations() {
  await requireAdmin()

  return <LocationsScreen />
}

export default function AdminEventLocationsPage() {
  return (
    <Suspense fallback={<LocationsScreenSkeleton />}>
      <AdminEventLocations />
    </Suspense>
  )
}
