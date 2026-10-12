import "server-only"

import { eq } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { conversation } from "@/core/db/schema/messaging"
import { requireActiveGroupMember } from "../group-conversations"
import { validateMessageBody } from "../model/message-body"
import { MessagingAccessError } from "../model/messaging-error"
import { appendMessage } from "./append-message"
import { resolveActiveDirectCounterpart } from "./direct-recipient"

type SendMessageInput = { conversationId: string; text: unknown; idempotencyKey: string }

export async function sendMessage(input: SendMessageInput) {
  const userId = await requireAuthenticatedUser()
  const body = validateMessageBody(input.text)

  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("idempotency-key-required")

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ kind: conversation.kind })
      .from(conversation)
      .where(eq(conversation.id, input.conversationId))
      .limit(1)
    if (!target) throw new MessagingAccessError("conversation-unavailable")
    if (target.kind === "group")
      return appendMessage(
        tx,
        {
          conversationId: input.conversationId,
          authorUserId: userId,
          text: body.data,
          idempotencyKey: input.idempotencyKey
        },
        () => requireActiveGroupMember(tx, input.conversationId, userId)
      )
    await resolveActiveDirectCounterpart(tx, input.conversationId, userId)
    return appendMessage(tx, {
      conversationId: input.conversationId,
      authorUserId: userId,
      text: body.data,
      idempotencyKey: input.idempotencyKey
    })
  })
}
