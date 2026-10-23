import "server-only"

import { and, count, eq, exists, sql } from "drizzle-orm"
import { cache } from "react"
import { db } from "@/core/db"
import { conversationReadState, directConversation, groupMembership, message } from "@/core/db/schema/messaging"
import { groupHistoryVisibility } from "../group-conversations/access"

/**
 * The number of the User's Conversations holding a Message past their read cursor, however
 * many Messages each holds. A former group member counts only the history retained for them.
 * Shared within a render, where the navigation's badge and menu dot both ask for it.
 */
export const countUnreadConversations = cache(async (userId: string): Promise<number> => {
  const [direct, group] = await Promise.all([countUnreadDirect(userId), countUnreadGroup(userId)])
  return direct + group
})

async function countUnreadDirect(userId: string) {
  const [row] = await db
    .select({ unread: count() })
    .from(conversationReadState)
    .innerJoin(directConversation, eq(directConversation.conversationId, conversationReadState.conversationId))
    .where(
      and(
        eq(conversationReadState.userId, userId),
        exists(
          db
            .select({ id: message.id })
            .from(message)
            .where(
              and(
                eq(message.conversationId, conversationReadState.conversationId),
                sql`${message.sequence} > ${conversationReadState.lastReadSequence}`
              )
            )
        )
      )
    )
  return row?.unread ?? 0
}

async function countUnreadGroup(userId: string) {
  const [row] = await db
    .select({ unread: count() })
    .from(groupMembership)
    .leftJoin(
      conversationReadState,
      and(
        eq(conversationReadState.conversationId, groupMembership.conversationId),
        eq(conversationReadState.userId, userId)
      )
    )
    .where(
      and(
        eq(groupMembership.userId, userId),
        exists(
          db
            .select({ id: message.id })
            .from(message)
            .where(
              and(
                eq(message.conversationId, groupMembership.conversationId),
                groupHistoryVisibility(message.sequence, groupMembership.historyVisibleThroughSequence),
                sql`${message.sequence} > COALESCE(${conversationReadState.lastReadSequence}, 0)`
              )
            )
        )
      )
    )
  return row?.unread ?? 0
}
