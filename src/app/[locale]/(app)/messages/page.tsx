import { Suspense } from "react"
import { MessagesScreen, MessagesScreenSkeleton } from "@/features/messaging"

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesScreenSkeleton />}>
      <MessagesScreen />
    </Suspense>
  )
}
