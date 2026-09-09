import "server-only"

import { and, eq, isNull, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversationMembership, directConversation, message } from "@/core/db/schema/messaging"
import { toInboxConversations } from "./inbox"
import { currentMessagingActor } from "./messaging-access"

export async function listDirectConversations() {
  const actor = await currentMessagingActor()
  const otherMember = alias(user, "other_member")
  const rows = await db
    .select({
      conversationId: conversationMembership.conversationId,
      otherMemberName: otherMember.name,
      otherMemberIsActive: sql<boolean>`COALESCE(${otherMember.banned} = false OR ${otherMember.banned} IS NULL, false)`,
      latestMessageText: sql<string>`(
        SELECT ${message.text}
        FROM ${message}
        WHERE ${message.conversationId} = ${conversationMembership.conversationId}
          AND ${message.deletedAt} IS NULL
        ORDER BY ${message.sequence} DESC
        LIMIT 1
      )`,
      latestMessageSentAt: sql<Date>`(
        SELECT ${message.sentAt}
        FROM ${message}
        WHERE ${message.conversationId} = ${conversationMembership.conversationId}
          AND ${message.deletedAt} IS NULL
        ORDER BY ${message.sequence} DESC
        LIMIT 1
      )`.mapWith(message.sentAt),
      unreadCount: sql<number>`(
        SELECT count(*)::integer
        FROM ${message}
        WHERE ${message.conversationId} = ${conversationMembership.conversationId}
          AND ${message.deletedAt} IS NULL
          AND ${message.sequence} >= ${conversationMembership.historyVisibleFromSequence}
          AND ${message.sequence} > ${conversationMembership.lastReadSequence}
      )`
    })
    .from(conversationMembership)
    .innerJoin(directConversation, eq(directConversation.conversationId, conversationMembership.conversationId))
    .leftJoin(
      otherMember,
      or(
        and(eq(directConversation.firstMemberId, actor.userId), eq(otherMember.id, directConversation.secondMemberId)),
        and(eq(directConversation.secondMemberId, actor.userId), eq(otherMember.id, directConversation.firstMemberId))
      )
    )
    .where(
      and(
        eq(conversationMembership.userId, actor.userId),
        isNull(conversationMembership.leftAt),
        sql`EXISTS (
          SELECT 1
          FROM ${message}
          WHERE ${message.conversationId} = ${conversationMembership.conversationId}
            AND ${message.deletedAt} IS NULL
        )`
      )
    )

  return toInboxConversations(rows)
}
