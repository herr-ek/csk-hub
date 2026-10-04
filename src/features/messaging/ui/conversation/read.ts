import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { conversation, conversationReadState, directConversation, groupMembership } from "@/core/db/schema/messaging"
import { getDirectCounterpartId } from "../../model/direct-conversation"
import { MessagingAccessError } from "../../model/messaging-error"
import { verifiesReadToken } from "./read-token"

export async function markConversationRead(conversationId: string, sequence: number, token: string) {
  const userId = await requireAuthenticatedUser()

  if (!Number.isInteger(sequence) || sequence < 1 || !verifiesReadToken(token, conversationId, userId, sequence))
    throw new MessagingAccessError("read-position-invalid")

  await db.transaction(async (tx) => {
    // A departure must not race a stale read token into a post-departure cursor.
    const [target] = await tx
      .select({ kind: conversation.kind })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .for("share")
    if (target?.kind === "group") {
      const [membership] = await tx
        .select({ visibleThrough: groupMembership.historyVisibleThroughSequence })
        .from(groupMembership)
        .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
        .limit(1)
      if (!membership || (membership.visibleThrough !== null && sequence > membership.visibleThrough))
        throw new MessagingAccessError("conversation-view-forbidden")
    } else {
      const [pair] = await tx
        .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
        .from(directConversation)
        .where(eq(directConversation.conversationId, conversationId))
        .limit(1)
      if (!pair || !getDirectCounterpartId(pair, userId)) throw new MessagingAccessError("conversation-view-forbidden")
    }
    await tx
      .update(conversationReadState)
      .set({ lastReadSequence: sql`GREATEST(${conversationReadState.lastReadSequence}, ${sequence})` })
      .where(and(eq(conversationReadState.conversationId, conversationId), eq(conversationReadState.userId, userId)))
  })
}
