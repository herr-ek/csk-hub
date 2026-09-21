import "server-only"

import { and, eq, sql } from "drizzle-orm"
import type { db } from "@/core/db"
import { conversation, conversationReadState, message } from "@/core/db/schema/messaging"
import { MessagingAccessError } from "../model/messaging-error"

/** The Drizzle transaction type inferred from this application's database client. */
export type MessageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The already-validated data required to append one Message.
 *
 * The caller establishes permission to send; this module makes the append durable, ordered,
 * retry-safe, and visible as read to its author.
 */
type AppendMessageInput = {
  conversationId: string
  authorUserId: string
  text: string
  idempotencyKey: string
}

async function lockSendIntent(
  tx: MessageTransaction,
  input: Pick<AppendMessageInput, "authorUserId" | "idempotencyKey">
) {
  // A retry uses the same key. Locking that key means two concurrent retries become one result,
  // even if a buggy client sends them to different Conversations.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.authorUserId}:${input.idempotencyKey}`}))`)
}

async function lockConversation(tx: MessageTransaction, conversationId: string) {
  // One Conversation row is the queue for its Messages. This lock keeps sequence allocation in
  // order, while sends in every other Conversation can continue normally.
  await tx.select({ id: conversation.id }).from(conversation).where(eq(conversation.id, conversationId)).for("update")
}

async function findPreviousSend(tx: MessageTransaction, input: AppendMessageInput) {
  const [retry] = await tx
    .select({
      id: message.id,
      conversationId: message.conversationId,
      sequence: message.sequence,
      text: message.text
    })
    .from(message)
    .where(and(eq(message.authorUserId, input.authorUserId), eq(message.idempotencyKey, input.idempotencyKey)))
    .limit(1)

  if (retry && (retry.conversationId !== input.conversationId || retry.text !== input.text)) {
    throw new MessagingAccessError("idempotency-key-reused")
  }

  if (!retry) return undefined
  return { id: retry.id, conversationId: retry.conversationId, sequence: retry.sequence }
}

/**
 * Appends a Message and advances the author's read position atomically.
 *
 * This is the persistence seam for every way of sending a Message. The caller supplies an active
 * transaction and has already established that the author may send in the Conversation.
 */
export async function appendMessage(tx: MessageTransaction, input: AppendMessageInput) {
  await lockSendIntent(tx, input)
  await lockConversation(tx, input.conversationId)

  const retry = await findPreviousSend(tx, input)
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
