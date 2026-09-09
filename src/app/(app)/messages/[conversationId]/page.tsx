import { ConversationScreen } from "@/features/messaging"

// Member-specific Messages access deliberately depends on the request session.
export const instant = false

export default async function ConversationPage({
  params,
  searchParams
}: {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<{ before?: string | string[] }>
}) {
  const [{ conversationId }, { before }] = await Promise.all([params, searchParams])
  const values = (Array.isArray(before) ? before[0] : before)?.split(",") ?? []
  const cursors = values.filter((value) => /^\d+$/.test(value)).map(Number)
  return <ConversationScreen conversationId={conversationId} before={cursors} />
}
