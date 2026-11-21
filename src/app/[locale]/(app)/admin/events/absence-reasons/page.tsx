import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { AbsenceReasonsScreen, AbsenceReasonsScreenSkeleton } from "@/features/events"

async function AdminAbsenceReasons() {
  await requirePermission({ action: "event.administer" })

  return <AbsenceReasonsScreen />
}

export default function AdminAbsenceReasonsPage() {
  return (
    <Suspense fallback={<AbsenceReasonsScreenSkeleton />}>
      <AdminAbsenceReasons />
    </Suspense>
  )
}
