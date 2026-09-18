import "server-only"

import { and, eq, sql } from "drizzle-orm"
import type { db } from "@/core/db"
import { conversation, conversationReadState, message } from "@/core/db/schema/messaging"
import { MessagingAccessError } from "../errors"

/** The Drizzle transaction type inferred from this application's database client. */
export type DirectTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The already-validated data needed to write one Message.
 *
 * Authorization and recipient availability are deliberately handled by the calling workflow.
 * Keeping those policy decisions outside this primitive lets it be shared by both a new Direct
 * Conversation and an existing Conversation without widening this module's responsibilities.
 */
type WriteMessageInput = {
  conversationId: string
  authorUserId: string
  text: string
  idempotencyKey: string
}

/**
 * Finds the result of a previous submission from this author using the same idempotency key.
 *
 * `writeMessage` calls this only after taking the Conversation lock, so concurrent identical
 * requests return the same persisted Message without an unlocked idempotency fast path.
 */
export async function findMessageByIdempotencyKey(
  tx: DirectTransaction,
  authorUserId: string,
  idempotencyKey: string,
  expectedRequest?: Pick<WriteMessageInput, "conversationId" | "text">
) {
  const [retry] = await tx
    .select({
      id: message.id,
      conversationId: message.conversationId,
      sequence: message.sequence,
      text: message.text
    })
    .from(message)
    .where(and(eq(message.authorUserId, authorUserId), eq(message.idempotencyKey, idempotencyKey)))
    .limit(1)

  if (
    retry &&
    expectedRequest &&
    (retry.conversationId !== expectedRequest.conversationId || retry.text !== expectedRequest.text)
  ) {
    throw new MessagingAccessError("idempotency-key-reused")
  }

  if (!retry) return undefined
  return { id: retry.id, conversationId: retry.conversationId, sequence: retry.sequence }
}

/**
 * Writes a Message and advances the author's read position atomically.
 *
 * The caller must pass the active database transaction and establish that the author may write to
 * the Conversation. Locking its row serializes appends without locking unrelated Conversations.
 * The Conversation holds the next sequence number, so allocation is constant-time and preserves
 * contiguous, per-conversation ordering.
 *
 * The idempotency lookup happens after acquiring that lock. Therefore two requests with the same
 * author and key return the same persisted Message, and only the request that creates it advances
 * the read cursor. All writes are part of the supplied transaction, so a failed cursor update also
 * rolls back the Message.
 */
export async function writeMessage(tx: DirectTransaction, input: WriteMessageInput) {
  await tx
    .select({ id: conversation.id })
    .from(conversation)
    .where(eq(conversation.id, input.conversationId))
    .for("update")

  const retry = await findMessageByIdempotencyKey(tx, input.authorUserId, input.idempotencyKey, input)
  if (retry) return { ...retry, created: false }

  const [allocated] = await tx
    .update(conversation)
    .set({
      nextMessageSequence: sql`${conversation.nextMessageSequence} + 1`,
      updatedAt: new Date()
    })
    .where(eq(conversation.id, input.conversationId))
    .returning({ sequence: sql<number>`${conversation.nextMessageSequence} - 1` })

  if (!allocated) throw new Error("Message sequence allocation did not return a record.")

  const { sequence } = allocated
  const [created] = await tx
    .insert(message)
    .values({ ...input, sequence })
    .returning({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })

  if (!created) throw new Error("Message creation did not return a record.")

  await tx
    .update(conversationReadState)
    .set({ lastReadSequence: sequence })
    .where(
      and(
        eq(conversationReadState.conversationId, input.conversationId),
        eq(conversationReadState.userId, input.authorUserId)
      )
    )

  return { ...created, created: true }
}
