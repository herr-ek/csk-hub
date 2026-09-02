import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { MembersScreen, MembersScreenSkeleton } from "@/member-management"

export const maxDuration = 60

async function AdminMembers() {
  await requireAdmin()

  return <MembersScreen />
}

export default function AdminMembersPage() {
  return (
    <Suspense fallback={<MembersScreenSkeleton />}>
      <AdminMembers />
    </Suspense>
  )
}
