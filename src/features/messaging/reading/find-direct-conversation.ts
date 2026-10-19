import "server-only"

import { and, eq } from "drizzle-orm"
import type { db } from "@/core/db"
import { directConversation } from "@/core/db/schema/messaging"

/**
 * Finds an existing Direct Conversation for an unordered pair of User IDs without creating history.
 * Callers must authenticate the viewer and verify both Users are active before exposing the result.
 * This lookup does not grant access to the Conversation.
 */
export async function findDirectConversation(database: typeof db, userId: string, recipientId: string) {
  if (userId === recipientId) return null
  const [first, second] = [userId, recipientId].sort()
  const [pair] = await database
    .select({ id: directConversation.conversationId })
    .from(directConversation)
    .where(and(eq(directConversation.firstMemberId, first), eq(directConversation.secondMemberId, second)))
    .limit(1)
  return pair?.id ?? null
}
