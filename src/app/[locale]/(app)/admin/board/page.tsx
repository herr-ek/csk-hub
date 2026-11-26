import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { BoardScreen, BoardScreenSkeleton } from "@/features/org-structure"

type SearchParams = Promise<{ year?: string | string[] }>

async function AdminBoard({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ action: "admin.access" })
  const { year } = await searchParams
  return <BoardScreen requestedYear={typeof year === "string" ? year : undefined} />
}

export default function AdminBoardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<BoardScreenSkeleton />}>
      <AdminBoard searchParams={searchParams} />
    </Suspense>
  )
}
