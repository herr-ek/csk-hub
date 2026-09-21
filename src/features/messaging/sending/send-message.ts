import "server-only"

import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
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
    await resolveActiveDirectCounterpart(tx, input.conversationId, userId)
    return appendMessage(tx, {
      conversationId: input.conversationId,
      authorUserId: userId,
      text: body.data,
      idempotencyKey: input.idempotencyKey
    })
  })
}
