import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { GigGroupsScreen, GigGroupsScreenSkeleton } from "@/features/org-structure"

async function AdminGigGroups() {
  await requireAdmin()
  return <GigGroupsScreen />
}

export default function AdminGigGroupsPage() {
  return (
    <Suspense fallback={<GigGroupsScreenSkeleton />}>
      <AdminGigGroups />
    </Suspense>
  )
}
