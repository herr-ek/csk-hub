import { MessagesScreen } from "@/features/messaging"

// Member-specific Messages access deliberately depends on the request session.
export const instant = false

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q = "" } = await searchParams
  const query = Array.isArray(q) ? (q[0] ?? "") : q
  return <MessagesScreen query={query} />
}
