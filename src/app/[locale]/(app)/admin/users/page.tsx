import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { UsersScreen, UsersScreenSkeleton } from "@/features/user-management"

export const maxDuration = 60

async function AdminUsers() {
  await requireAdmin()

  return <UsersScreen />
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<UsersScreenSkeleton />}>
      <AdminUsers />
    </Suspense>
  )
}
