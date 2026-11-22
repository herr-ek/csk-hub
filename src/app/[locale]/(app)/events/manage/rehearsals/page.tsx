import { Suspense } from "react"
import { RehearsalScheduleScreen, RehearsalScheduleScreenSkeleton } from "@/features/events"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function Schedule({ searchParams }: { searchParams: SearchParams }) {
  return <RehearsalScheduleScreen searchParams={await searchParams} />
}

export default function RehearsalSchedulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RehearsalScheduleScreenSkeleton />}>
      <Schedule searchParams={searchParams} />
    </Suspense>
  )
}
