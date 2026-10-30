import { Suspense } from "react"
import { MemberCareerScreen, MemberCareerSkeleton } from "@/features/members"

export default function MyCareerPage() {
  return (
    <Suspense fallback={<MemberCareerSkeleton />}>
      <MemberCareerScreen />
    </Suspense>
  )
}
