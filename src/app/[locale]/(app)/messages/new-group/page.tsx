import { Suspense } from "react"
import { NewConversationScreenSkeleton, NewGroupConversationScreen } from "@/features/messaging"

export default function NewGroupConversationPage() {
  return (
    <Suspense fallback={<NewConversationScreenSkeleton />}>
      <NewGroupConversationScreen />
    </Suspense>
  )
}
