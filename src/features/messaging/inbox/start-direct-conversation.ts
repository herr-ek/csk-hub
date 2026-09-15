import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversation, conversationMembership, directConversation } from "@/core/db/schema/messaging"
import { currentMessagingUserId, MessagingAccessError } from "../access"
import { appendMessage, findMessageRetry } from "../message-write"
import { validateMessageBody } from "../shared/message-body"

type StartDirectConversationInput = { recipientId: string; text: unknown; idempotencyKey: string }

/** Creates a direct conversation when needed, then appends its first message. */
export async function startDirectConversation(input: StartDirectConversationInput) {
  const userId = await currentMessagingUserId()
  const body = validateMessageBody(input.text)
  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.recipientId.trim()) throw new MessagingAccessError("recipient-required")
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("idempotency-key-required")
  if (userId === input.recipientId) throw new MessagingAccessError("self-recipient")

  return db.transaction(async (tx) => {
    const retry = await findMessageRetry(tx, userId, input.idempotencyKey)
    if (retry) return { ...retry, created: false }

    const [recipient] = await tx.select({ id: user.id }).from(user).where(eq(user.id, input.recipientId)).limit(1)
    if (!recipient) throw new MessagingAccessError("recipient-required")

    const [firstMemberId, secondMemberId] = [userId, recipient.id].sort()
    // Lock the normalized pair so concurrent first messages share one conversation.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${firstMemberId}:${secondMemberId}`}))`)

    const [existing] = await tx
      .select({ conversationId: directConversation.conversationId })
      .from(directConversation)
      .where(
        and(eq(directConversation.firstMemberId, firstMemberId), eq(directConversation.secondMemberId, secondMemberId))
      )
      .limit(1)

    const lockedRetry = await findMessageRetry(tx, userId, input.idempotencyKey)
    if (lockedRetry) return { ...lockedRetry, created: false }

    let conversationId = existing?.conversationId
    if (!conversationId) {
      const [created] = await tx
        .insert(conversation)
        .values({ kind: "direct", createdByUserId: userId })
        .returning({ id: conversation.id })
      if (!created) throw new Error("Conversation creation did not return a record.")
      conversationId = created.id
      await tx.insert(directConversation).values({ conversationId, firstMemberId, secondMemberId })
      await tx.insert(conversationMembership).values([
        { conversationId, userId },
        { conversationId, userId: recipient.id }
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
