import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { GroupsScreen, GroupsScreenSkeleton } from "@/features/org-structure"

async function AdminGroups() {
  await requireAdmin()

  return <GroupsScreen />
}

export default function AdminGroupsPage() {
  return (
    <Suspense fallback={<GroupsScreenSkeleton />}>
      <AdminGroups />
    </Suspense>
  )
}
