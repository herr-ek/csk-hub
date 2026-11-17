import { Suspense } from "react"
import { NewEventScreen, NewEventScreenSkeleton } from "@/features/events"

export default function NewEventPage() {
  return (
    <Suspense fallback={<NewEventScreenSkeleton />}>
      <NewEventScreen />
    </Suspense>
  )
}
