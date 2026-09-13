import { Suspense } from "react"
import { MemberProfileScreen, MemberProfileScreenSkeleton } from "@/features/account"

export default function Me() {
  return (
    <Suspense fallback={<MemberProfileScreenSkeleton />}>
      <MemberProfileScreen />
    </Suspense>
  )
}
