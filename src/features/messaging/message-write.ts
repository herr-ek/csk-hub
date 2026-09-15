import "server-only"

import { and, eq, isNull, max, sql } from "drizzle-orm"
import type { db } from "@/core/db"
import { conversationMembership, message } from "@/core/db/schema/messaging"

/** The Drizzle transaction type inferred from this application's database client. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The already-validated data needed to append one Message.
 *
 * Authorization and recipient availability are deliberately handled by the calling workflow.
 * Keeping those policy decisions outside this primitive lets it be shared by both a new Direct
 * Conversation and an existing Conversation without widening this module's responsibilities.
 */
type AppendMessageInput = {
  conversationId: string
  authorUserId: string
  text: string
  idempotencyKey: string
}

/**
 * Finds the result of a previous submission from this author using the same idempotency key.
 *
 * Call this before performing workflow-specific work when a retry should return immediately, and
 * call it again after any workflow-specific lock. `appendMessage` performs the final check while
 * holding the Conversation lock, which closes the race between concurrent identical requests.
 */
export async function findMessageRetry(tx: Transaction, authorUserId: string, idempotencyKey: string) {
  const [retry] = await tx
    .select({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
    .from(message)
    .where(and(eq(message.authorUserId, authorUserId), eq(message.idempotencyKey, idempotencyKey)))
    .limit(1)
  return retry
}

/**
 * Appends a Message and advances the author's read position atomically.
 *
 * The caller must pass the active database transaction and establish that the author may write to
 * the Conversation. A transaction-scoped PostgreSQL advisory lock serializes all appends for this
 * Conversation. This makes `MAX(sequence) + 1` safe and preserves contiguous, per-conversation
 * ordering without locking unrelated Conversations.
 *
 * The idempotency lookup happens after acquiring that lock. Therefore two requests with the same
 * author and key return the same persisted Message, and only the request that creates it advances
 * the read cursor. All writes are part of the supplied transaction, so a failed cursor update also
 * rolls back the Message.
 */
export async function appendMessage(tx: Transaction, input: AppendMessageInput) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.conversationId}))`)
  const retry = await findMessageRetry(tx, input.authorUserId, input.idempotencyKey)
  if (retry) return { ...retry, created: false }

  const [latest] = await tx
    .select({ sequence: max(message.sequence) })
    .from(message)
    .where(eq(message.conversationId, input.conversationId))
  const sequence = (latest?.sequence ?? 0) + 1
  const [created] = await tx
    .insert(message)
    .values({ ...input, sequence })
    .returning({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
  if (!created) throw new Error("Message creation did not return a record.")

  await tx
    .update(conversationMembership)
    .set({ lastReadSequence: sequence })
    .where(
      and(
        eq(conversationMembership.conversationId, input.conversationId),
        eq(conversationMembership.userId, input.authorUserId),
        isNull(conversationMembership.leftAt)
      )
    )
  return { ...created, created: true }
}
