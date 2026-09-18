import { notFound } from "next/navigation"
import { Suspense } from "react"
import { NewConversationScreen, NewConversationScreenSkeleton } from "@/features/messaging"

type NewConversationPageProps = {
  searchParams: Promise<{ recipientId?: string }>
}

async function NewConversationContent({ searchParams }: NewConversationPageProps) {
  const { recipientId } = await searchParams
  if (!recipientId) notFound()
  return <NewConversationScreen recipientId={recipientId} />
}

export default function NewConversationPage({ searchParams }: NewConversationPageProps) {
  return (
    <Suspense fallback={<NewConversationScreenSkeleton />}>
      <NewConversationContent searchParams={searchParams} />
    </Suspense>
  )
}
