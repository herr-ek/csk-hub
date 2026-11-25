import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { CommitteesScreen, CommitteesScreenSkeleton } from "@/features/org-structure"

type SearchParams = Promise<{ committee?: string | string[]; year?: string | string[] }>

async function AdminCommittees({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ action: "admin.access" })
  const { committee, year } = await searchParams
  return (
    <CommitteesScreen
      requestedCommittee={typeof committee === "string" ? committee : undefined}
      requestedYear={typeof year === "string" ? year : undefined}
    />
  )
}

export default function AdminCommitteesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CommitteesScreenSkeleton />}>
      <AdminCommittees searchParams={searchParams} />
    </Suspense>
  )
}
