import { Suspense } from "react"
import { MemberDirectoryScreen, MemberDirectorySkeleton } from "@/features/members"

export default function MembersPage({
  searchParams
}: {
  searchParams: Promise<{ query?: string | string[]; page?: string | string[] }>
}) {
  return (
    <Suspense fallback={<MemberDirectorySkeleton />}>
      <MemberDirectoryScreen searchParams={searchParams} />
    </Suspense>
  )
}
