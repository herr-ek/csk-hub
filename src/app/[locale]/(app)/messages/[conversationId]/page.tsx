import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"
import { ConversationScreen, ConversationScreenSkeleton } from "@/features/messaging"

const conversationIdSchema = z.uuid()

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
  if (!conversationIdSchema.safeParse(conversationId).success) notFound()
  return <ConversationScreen conversationId={conversationId} beforeSequence={parseBeforeSequence(before)} />
}

function parseBeforeSequence(before: string | string[] | undefined) {
  const value = Array.isArray(before) ? before[0] : before
  if (!value || !/^\d+$/.test(value)) return undefined

  const sequence = Number(value)
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : undefined
}
