import "server-only"

import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/core/db"
import { conversationMembership } from "@/core/db/schema/messaging"
import { currentMessagingUserId, MessagingAccessError } from "../access"
import { verifiesReadToken } from "./read-token"

export async function markConversationRead(conversationId: string, sequence: number, token: string) {
  const userId = await currentMessagingUserId()
  if (!Number.isInteger(sequence) || sequence < 1 || !verifiesReadToken(token, conversationId, userId, sequence))
    throw new MessagingAccessError("read-position-invalid")

  const [membership] = await db
    .select({ historyVisibleFromSequence: conversationMembership.historyVisibleFromSequence })
    .from(conversationMembership)
    .where(
      and(
        eq(conversationMembership.conversationId, conversationId),
        eq(conversationMembership.userId, userId),
        isNull(conversationMembership.leftAt)
      )
    )
    .limit(1)
  if (!membership) throw new MessagingAccessError("conversation-view-forbidden")

  await db
    .update(conversationMembership)
    .set({ lastReadSequence: sql`GREATEST(${conversationMembership.lastReadSequence}, ${sequence})` })
    .where(
      and(
        eq(conversationMembership.conversationId, conversationId),
        eq(conversationMembership.userId, userId),
        isNull(conversationMembership.leftAt)
      )
    )
}
