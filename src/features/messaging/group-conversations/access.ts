import "server-only"

import { and, eq } from "drizzle-orm"
import { conversation, groupMembership } from "@/core/db/schema/messaging"
import { MessagingAccessError } from "../model/messaging-error"
import type { MessageTransaction } from "../sending"

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
export async function requireActiveGroupMember(tx: MessageTransaction, conversationId: string, userId: string) {
  const [membership] = await tx
    .select({ leftAt: groupMembership.leftAt })
    .from(groupMembership)
    .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
    .limit(1)
  if (!membership || membership.leftAt) throw new MessagingAccessError("conversation-send-forbidden")
}
