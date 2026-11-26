import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { ChoirPositionsScreen, ChoirPositionsScreenSkeleton } from "@/features/org-structure"

async function AdminChoirPositions() {
  await requirePermission({ action: "admin.access" })
  return <ChoirPositionsScreen />
}

export default function AdminChoirPositionsPage() {
  return (
    <Suspense fallback={<ChoirPositionsScreenSkeleton />}>
      <AdminChoirPositions />
    </Suspense>
  )
}
