import { Suspense } from "react"
import { UserProfileScreen, UserProfileScreenSkeleton } from "@/features/account"

export default function Me() {
  return (
    <Suspense fallback={<UserProfileScreenSkeleton />}>
      <UserProfileScreen />
    </Suspense>
  )
}
