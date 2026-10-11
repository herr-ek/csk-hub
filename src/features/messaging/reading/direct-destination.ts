import "server-only"

import { and, eq, isNull, or } from "drizzle-orm"
import type { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { directConversation } from "@/core/db/schema/messaging"

/** Read-only lookup for a pair of active Users. Neither navigation nor lookup creates history. */
export async function findDirectConversation(database: typeof db, userId: string, recipientId: string) {
  if (userId === recipientId) return null
  const active = await database
    .select({ id: user.id })
    .from(user)
    .where(and(or(eq(user.id, userId), eq(user.id, recipientId)), or(eq(user.banned, false), isNull(user.banned))))
  if (active.length !== 2) return null
  const [first, second] = [userId, recipientId].sort()
  const [pair] = await database
    .select({ id: directConversation.conversationId })
    .from(directConversation)
    .where(and(eq(directConversation.firstMemberId, first), eq(directConversation.secondMemberId, second)))
    .limit(1)
  return pair?.id ?? null
}
