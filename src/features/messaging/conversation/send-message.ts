import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/core/db"
import { conversationMembership, directConversation } from "@/core/db/schema/messaging"
import { currentMessagingUserId, MessagingAccessError } from "../access"
import { appendMessage, findMessageRetry } from "../message-write"
import { validateMessageBody } from "../shared/message-body"

type SendMessageInput = { conversationId: string; text: unknown; idempotencyKey: string }

export async function sendMessage(input: SendMessageInput) {
  const userId = await currentMessagingUserId()
  const body = validateMessageBody(input.text)
  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("idempotency-key-required")

  return db.transaction(async (tx) => {
    const retry = await findMessageRetry(tx, userId, input.idempotencyKey)
    if (retry) return { ...retry, created: false }

    const [membership] = await tx
      .select({ conversationId: conversationMembership.conversationId })
      .from(conversationMembership)
      .where(
        and(
          eq(conversationMembership.conversationId, input.conversationId),
          eq(conversationMembership.userId, userId),
          isNull(conversationMembership.leftAt)
        )
      )
      .limit(1)
    if (!membership) throw new MessagingAccessError("conversation-send-forbidden")

    const [pair] = await tx
      .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
      .from(directConversation)
      .where(eq(directConversation.conversationId, input.conversationId))
      .limit(1)
    if (!pair) throw new MessagingAccessError("conversation-unavailable")
    const otherMemberId =
      pair.firstMemberId === userId
        ? pair.secondMemberId
        : pair.secondMemberId === userId
          ? pair.firstMemberId
          : undefined
    if (!otherMemberId) throw new MessagingAccessError("conversation-unavailable")

    const [otherMembership] = await tx
      .select({ userId: conversationMembership.userId })
      .from(conversationMembership)
      .where(
        and(
          eq(conversationMembership.conversationId, input.conversationId),
          eq(conversationMembership.userId, otherMemberId),
          isNull(conversationMembership.leftAt)
        )
      )
      .limit(1)
    if (!otherMembership) throw new MessagingAccessError("conversation-recipient-inactive")

    return appendMessage(tx, {
      conversationId: input.conversationId,
      authorUserId: userId,
      text: body.data,
      idempotencyKey: input.idempotencyKey
    })
  })
}
