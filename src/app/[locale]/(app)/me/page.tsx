import { Suspense } from "react"
import { MemberProfileScreen, MemberProfileSkeleton } from "@/features/members"

export default function Me() {
  return (
    <Suspense fallback={<MemberProfileSkeleton />}>
      <MemberProfileScreen />
    </Suspense>
  )
}
