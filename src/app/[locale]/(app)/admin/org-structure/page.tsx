import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { ChoirsScreen, ChoirsScreenSkeleton } from "@/features/org-structure"

async function AdminChoirs() {
  await requireAdmin()

  return <ChoirsScreen />
}

export default function AdminChoirsPage() {
  return (
    <Suspense fallback={<ChoirsScreenSkeleton />}>
      <AdminChoirs />
    </Suspense>
  )
}
