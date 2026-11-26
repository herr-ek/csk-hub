import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { GigGroupsScreen, GigGroupsScreenSkeleton } from "@/features/org-structure"

async function AdminGigGroups() {
  await requirePermission({ action: "admin.access" })
  return <GigGroupsScreen />
}

export default function AdminGigGroupsPage() {
  return (
    <Suspense fallback={<GigGroupsScreenSkeleton />}>
      <AdminGigGroups />
    </Suspense>
  )
}
