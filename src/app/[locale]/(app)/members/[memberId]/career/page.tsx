import { Suspense } from "react"
import { MemberCareerScreen, MemberCareerSkeleton } from "@/features/members"

async function CareerContent({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  return <MemberCareerScreen memberId={memberId} />
}

export default function MemberCareerPage({ params }: { params: Promise<{ memberId: string }> }) {
  return (
    <Suspense fallback={<MemberCareerSkeleton />}>
      <CareerContent params={params} />
    </Suspense>
  )
}
