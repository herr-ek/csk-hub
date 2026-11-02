import "server-only"

import { and, eq, lt, sql } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { conversation, conversationReadState, directConversation, groupMembership } from "@/core/db/schema/messaging"
import { queueActivity } from "@/core/realtime/outbox"
import { acknowledgeConversationActivity } from "../../activity"
import { canViewGroupSequence } from "../../group-conversations/access"
import { getDirectCounterpartId } from "../../model/direct-conversation"
import { MessagingAccessError } from "../../model/messaging-error"
import { verifiesReadToken } from "./read-token"

export async function markConversationRead(conversationId: string, sequence: number, token: string) {
  const userId = await requireAuthenticatedUser()

  if (!Number.isInteger(sequence) || sequence < 1 || !verifiesReadToken(token, conversationId, userId, sequence))
    throw new MessagingAccessError("read-position-invalid")

  await db.transaction(async (tx) => {
    // Conversation kind is immutable; resolving it must not contend with sends.
    const [target] = await tx
      .select({ kind: conversation.kind })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1)
    if (target?.kind === "group") {
      // Freeze this member's departure cutoff without locking the send sequence.
      const [membership] = await tx
        .select({ visibleThrough: groupMembership.historyVisibleThroughSequence })
        .from(groupMembership)
        .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
        .for("share")
        .limit(1)
      if (!membership || !canViewGroupSequence(sequence, membership.visibleThrough))
        throw new MessagingAccessError("conversation-view-forbidden")
    } else {
      const [pair] = await tx
        .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
        .from(directConversation)
        .where(eq(directConversation.conversationId, conversationId))
        .limit(1)
      if (!pair || !getDirectCounterpartId(pair, userId)) throw new MessagingAccessError("conversation-view-forbidden")
    }
    const changed = await tx
      .update(conversationReadState)
      .set({ lastReadSequence: sql`GREATEST(${conversationReadState.lastReadSequence}, ${sequence})` })
      .where(
        and(
          eq(conversationReadState.conversationId, conversationId),
          eq(conversationReadState.userId, userId),
          lt(conversationReadState.lastReadSequence, sequence)
        )
      )
      .returning({ sequence: conversationReadState.lastReadSequence })
    await acknowledgeConversationActivity(tx, userId, conversationId, sequence)
    if (changed.length) await queueActivity(tx, [userId], { kind: "unread.changed" })
  })
}
