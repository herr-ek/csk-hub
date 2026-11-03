import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { PositionsScreen, PositionsScreenSkeleton } from "@/features/org-structure"

type SearchParams = Promise<{ year?: string | string[] }>

async function AdminPositions({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ action: "admin.access" })
  const { year } = await searchParams
  return <PositionsScreen requestedYear={typeof year === "string" ? year : undefined} />
}

export default function AdminPositionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PositionsScreenSkeleton />}>
      <AdminPositions searchParams={searchParams} />
    </Suspense>
  )
}
