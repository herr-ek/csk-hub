import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { PositionsScreen, PositionsScreenSkeleton } from "@/features/org-structure-management"

type SearchParams = Promise<{ year?: string | string[] }>

async function AdminPositions({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin()
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
