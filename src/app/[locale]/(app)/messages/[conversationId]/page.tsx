import { Suspense } from "react"
import { ConversationScreen, ConversationScreenSkeleton } from "@/features/messaging"

export default function ConversationPage({
  params,
  searchParams
}: {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<{ before?: string | string[] }>
}) {
  return (
    <Suspense fallback={<ConversationScreenSkeleton />}>
      <ConversationPageContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function ConversationPageContent({
  params,
  searchParams
}: {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<{ before?: string | string[] }>
}) {
  const [{ conversationId }, { before }] = await Promise.all([params, searchParams])
  const value = Array.isArray(before) ? before[0] : before
  const requestedBefore = value && /^\d+$/.test(value) ? Number(value) : undefined
  const beforeSequence =
    requestedBefore && Number.isSafeInteger(requestedBefore) && requestedBefore > 0 ? requestedBefore : undefined
  return <ConversationScreen conversationId={conversationId} beforeSequence={beforeSequence} />
}
