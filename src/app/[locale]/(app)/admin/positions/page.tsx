import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { PositionsScreen, PositionsScreenSkeleton } from "@/features/org-structure"

type SearchParams = Promise<{ view?: string | string[]; year?: string | string[] }>

async function AdminPositions({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ action: "admin.access" })
  const { view, year } = await searchParams
  return (
    <PositionsScreen
      requestedView={typeof view === "string" ? view : undefined}
      requestedYear={typeof year === "string" ? year : undefined}
    />
  )
}

export default function AdminPositionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PositionsScreenSkeleton />}>
      <AdminPositions searchParams={searchParams} />
    </Suspense>
  )
}
