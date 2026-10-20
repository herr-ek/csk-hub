import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { GroupsScreen, GroupsScreenSkeleton } from "@/features/org-structure"

async function AdminGroups() {
  await requirePermission({ action: "admin.access" })

  return <GroupsScreen />
}

export default function AdminGroupsPage() {
  return (
    <Suspense fallback={<GroupsScreenSkeleton />}>
      <AdminGroups />
    </Suspense>
  )
}
