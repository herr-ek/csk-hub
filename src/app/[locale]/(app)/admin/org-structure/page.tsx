import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { ChoirsScreen, ChoirsScreenSkeleton } from "@/features/org-structure"

async function AdminChoirs() {
  await requirePermission({ action: "admin.access" })

  return <ChoirsScreen />
}

export default function AdminChoirsPage() {
  return (
    <Suspense fallback={<ChoirsScreenSkeleton />}>
      <AdminChoirs />
    </Suspense>
  )
}
