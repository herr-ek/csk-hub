import "server-only"

import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { MessagingAccessError } from "../errors"
import { validateMessageBody } from "../message-text"
import { resolveActiveDirectCounterpart } from "./participant"
import { writeMessage } from "./write"

type SendMessageInput = { conversationId: string; text: unknown; idempotencyKey: string }

export async function sendMessage(input: SendMessageInput) {
  const userId = await requireAuthenticatedUser()
  const body = validateMessageBody(input.text)

  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("idempotency-key-required")

  return db.transaction(async (tx) => {
    await resolveActiveDirectCounterpart(tx, input.conversationId, userId)
    return writeMessage(tx, {
      conversationId: input.conversationId,
      authorUserId: userId,
      text: body.data,
      idempotencyKey: input.idempotencyKey
    })
  })
}
