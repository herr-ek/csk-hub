import "server-only"

import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversationMembership, directConversation, message } from "@/core/db/schema/messaging"
import { currentMessagingUserId } from "../access"
import { toInboxConversations } from "./view-model"

export async function listDirectConversations() {
  const userId = await currentMessagingUserId()
  const otherMember = alias(user, "other_member")
  const latestMessage = db
    .select({ text: message.text, sentAt: message.sentAt })
    .from(message)
    .where(and(eq(message.conversationId, conversationMembership.conversationId), isNull(message.deletedAt)))
    .orderBy(desc(message.sequence))
    .limit(1)
    .as("latest_message")
  const unreadMessages = db
    .select({ count: count() })
    .from(message)
    .where(
      and(
        eq(message.conversationId, conversationMembership.conversationId),
        isNull(message.deletedAt),
        sql`${message.sequence} >= ${conversationMembership.historyVisibleFromSequence}`,
        sql`${message.sequence} > ${conversationMembership.lastReadSequence}`
      )
    )
    .as("unread_messages")
  const rows = await db
    .select({
      conversationId: conversationMembership.conversationId,
      otherMemberName: otherMember.name,
      latestMessageText: latestMessage.text,
      latestMessageSentAt: latestMessage.sentAt,
      unreadCount: unreadMessages.count
    })
    .from(conversationMembership)
    .innerJoin(directConversation, eq(directConversation.conversationId, conversationMembership.conversationId))
    .leftJoin(
      otherMember,
      or(
        and(eq(directConversation.firstMemberId, userId), eq(otherMember.id, directConversation.secondMemberId)),
        and(eq(directConversation.secondMemberId, userId), eq(otherMember.id, directConversation.firstMemberId))
      )
    )
    .innerJoinLateral(latestMessage, sql`true`)
    .innerJoinLateral(unreadMessages, sql`true`)
    .where(and(eq(conversationMembership.userId, userId), isNull(conversationMembership.leftAt)))
    .orderBy(desc(latestMessage.sentAt))

  return toInboxConversations(rows)
}
