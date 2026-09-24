import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { conversation, conversationReadState, directConversation } from "@/core/db/schema/messaging"
import { validateMessageBody } from "../model/message-body"
import { MessagingAccessError } from "../model/messaging-error"
import { appendMessage } from "./append-message"
import { requireActiveDirectRecipient } from "./direct-recipient"

type StartDirectConversationInput = { recipientId: string; text: unknown; idempotencyKey: string }

/** Creates a direct conversation when needed, then appends its first message. */
export async function startDirectConversation(input: StartDirectConversationInput) {
  const userId = await requireAuthenticatedUser()
  const body = validateMessageBody(input.text)

  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.recipientId.trim()) throw new MessagingAccessError("recipient-required")
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("idempotency-key-required")
  if (userId === input.recipientId) throw new MessagingAccessError("self-recipient")

  return db.transaction(async (tx) => {
    const recipientId = await requireActiveDirectRecipient(tx, input.recipientId)

    const [firstMemberId, secondMemberId] = [userId, recipientId].sort()

    // A pair may own only one Direct Conversation. This lock makes simultaneous first messages
    // wait for one another, so the second request finds the Conversation made by the first.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${firstMemberId}:${secondMemberId}`}))`)

    const [existing] = await tx
      .select({ conversationId: directConversation.conversationId })
      .from(directConversation)
      .where(
        and(eq(directConversation.firstMemberId, firstMemberId), eq(directConversation.secondMemberId, secondMemberId))
      )
      .limit(1)

    let conversationId = existing?.conversationId

    if (!conversationId) {
      const [created] = await tx.insert(conversation).values({ kind: "direct" }).returning({ id: conversation.id })
      if (!created) throw new Error("Conversation creation did not return a record.")
      conversationId = created.id
      await tx.insert(directConversation).values({ conversationId, firstMemberId, secondMemberId })
      await tx.insert(conversationReadState).values([
        { conversationId, userId },
        { conversationId, userId: recipientId }
      ])
    }

    return appendMessage(tx, {
      conversationId,
      authorUserId: userId,
      text: body.data,
      idempotencyKey: input.idempotencyKey
    })
  })
}
