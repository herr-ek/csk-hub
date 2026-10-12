import "server-only"

import { and, eq, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { conversation, groupMembership } from "@/core/db/schema/messaging"
import { MessagingAccessError, type MessagingErrorKind } from "../model/messaging-error"
import type { MessageTransaction } from "../sending"

/** Applies the stored departure cutoff to either a value or a SQL column. */
export function groupHistoryVisibility(sequence: SQLWrapper, visibleThrough: number | null | SQLWrapper): SQL {
  if (typeof visibleThrough === "number") return sql`${sequence} <= ${visibleThrough}`
  if (visibleThrough === null) return sql`true`
  return sql`(${visibleThrough} IS NULL OR ${sequence} <= ${visibleThrough})`
}

/** Whether a sequence is within the history retained for this member. */
export function canViewGroupSequence(sequence: number, visibleThrough: number | null) {
  return visibleThrough === null || sequence <= visibleThrough
}

/** All group membership changes and sends serialize on the Conversation row. */
export async function lockGroupConversation(tx: MessageTransaction, conversationId: string) {
  const [row] = await tx
    .select({ nextMessageSequence: conversation.nextMessageSequence })
    .from(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.kind, "group")))
    .for("update")
  if (!row) throw new MessagingAccessError("conversation-unavailable")
  return row
}

/** Call with the Conversation locked so a departure cannot race authorization. */
export async function requireActiveGroupMember(
  tx: MessageTransaction,
  conversationId: string,
  userId: string,
  forbiddenKind: MessagingErrorKind = "conversation-send-forbidden"
) {
  const [membership] = await tx
    .select({ leftAt: groupMembership.leftAt })
    .from(groupMembership)
    .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
    .limit(1)
  if (!membership || membership.leftAt) throw new MessagingAccessError(forbiddenKind)
}
