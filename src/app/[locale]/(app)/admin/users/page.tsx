import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { UsersScreen, UsersScreenSkeleton } from "@/features/user-management"

export const maxDuration = 60

async function AdminUsers() {
  await requirePermission({ action: "admin.access" })

  return <UsersScreen />
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<UsersScreenSkeleton />}>
      <AdminUsers />
    </Suspense>
  )
}
