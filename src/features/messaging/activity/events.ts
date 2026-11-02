import "server-only"

import { and, eq, isNull, or, sql } from "drizzle-orm"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { activityDelivery } from "@/core/db/schema/activity"
import { user } from "@/core/db/schema/auth"
import { conversationReadState, directConversation, groupMembership } from "@/core/db/schema/messaging"
import { conversationPath } from "@/core/navigation/navigation-utils"
import type { ActivityTransaction } from "@/core/realtime/outbox"
import { queueActivity } from "@/core/realtime/outbox"

async function activeConversationUsers(tx: ActivityTransaction, conversationId: string) {
  return tx
    .select({ id: user.id })
    .from(conversationReadState)
    .innerJoin(user, eq(user.id, conversationReadState.userId))
    .leftJoin(directConversation, eq(directConversation.conversationId, conversationReadState.conversationId))
    .leftJoin(
      groupMembership,
      and(eq(groupMembership.conversationId, conversationReadState.conversationId), eq(groupMembership.userId, user.id))
    )
    .where(
      and(
        eq(conversationReadState.conversationId, conversationId),
        or(eq(user.banned, false), isNull(user.banned)),
        or(
          eq(directConversation.firstMemberId, user.id),
          eq(directConversation.secondMemberId, user.id),
          and(eq(groupMembership.userId, user.id), isNull(groupMembership.leftAt))
        )
      )
    )
}

/** Only a newly appended Message calls this, before its transaction commits. */
export async function queueMessageActivity(
  tx: ActivityTransaction,
  input: {
    conversationId: string
    authorUserId: string
    sequence: number
    text: string
  }
) {
  if (!env.REDIS_URL) return
  const members = await activeConversationUsers(tx, input.conversationId)
  const [author] = await tx.select({ name: user.name }).from(user).where(eq(user.id, input.authorUserId))
  const others = members.filter(({ id }) => id !== input.authorUserId).map(({ id }) => id)
  await queueActivity(
    tx,
    others,
    {
      kind: "message.created",
      conversationId: input.conversationId,
      sequence: input.sequence
    },
    { body: [...input.text].slice(0, 400).join(""), title: author?.name, href: conversationPath(input.conversationId) }
  )
  await queueActivity(tx, [input.authorUserId], { kind: "unread.changed" })
}

/** Current members receive group changes; the departing User gets only a personal invalidation. */
export async function queueConversationActivity(
  tx: ActivityTransaction,
  conversationId: string,
  departedUserId?: string
) {
  if (!env.REDIS_URL) return
  const members = await activeConversationUsers(tx, conversationId)
  await queueActivity(
    tx,
    members.map(({ id }) => id),
    { kind: "conversation.changed", conversationId }
  )
  if (departedUserId) await queueActivity(tx, [departedUserId], { kind: "unread.changed" })
}

/** Rechecks current authority at stream delivery, acknowledgement, and push dispatch. */
export async function canReceiveConversationActivity(userId: string, conversationId: string) {
  const members = await db.transaction((tx) => activeConversationUsers(tx, conversationId))
  return members.some(({ id }) => id === userId)
}

/** Signed rendered-history acknowledgement, distinct from transport receipt. */
export async function acknowledgeConversationActivity(
  tx: ActivityTransaction,
  userId: string,
  conversationId: string,
  sequence: number
) {
  if (!env.REDIS_URL) return
  await tx
    .update(activityDelivery)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(activityDelivery.userId, userId),
        sql`${activityDelivery.change}->>'kind' = 'message.created'`,
        sql`${activityDelivery.change}->>'conversationId' = ${conversationId}`,
        sql`(${activityDelivery.change}->>'sequence')::integer <= ${sequence}`,
        isNull(activityDelivery.acknowledgedAt)
      )
    )
}

/** Whether the existing authoritative cursor makes a Message notification unnecessary. */
export async function hasOpenedMessage(userId: string, conversationId: string, sequence: number) {
  const [state] = await db
    .select({ sequence: conversationReadState.lastReadSequence })
    .from(conversationReadState)
    .where(and(eq(conversationReadState.userId, userId), eq(conversationReadState.conversationId, conversationId)))
  return Boolean(state && state.sequence >= sequence)
}
