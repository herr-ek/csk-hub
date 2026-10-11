import { Suspense } from "react"
import { MemberProfileScreen, MemberProfileSkeleton } from "@/features/members"

async function ProfileContent({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  return <MemberProfileScreen memberId={memberId} />
}

export default function MemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  return (
    <Suspense fallback={<MemberProfileSkeleton />}>
      <ProfileContent params={params} />
    </Suspense>
  )
}
