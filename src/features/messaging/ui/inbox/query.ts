import "server-only"

import { and, count, desc, eq, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversationReadState, directConversation, message } from "@/core/db/schema/messaging"
import { toInboxConversations } from "./view-model"

export async function listDirectConversations() {
  const userId = await requireAuthenticatedUser()
  const otherMember = alias(user, "other_member")

  const latestMessage = db
    .select({ text: message.text, sentAt: message.sentAt })
    .from(message)
    .where(eq(message.conversationId, conversationReadState.conversationId))
    .orderBy(desc(message.sequence))
    .limit(1)
    .as("latest_message")

  const unreadMessages = db
    .select({ count: count().as("count") })
    .from(message)
    .where(
      and(
        eq(message.conversationId, conversationReadState.conversationId),
        sql`${message.sequence} > ${conversationReadState.lastReadSequence}`
      )
    )
    .as("unread_messages")

  const rows = await db
    .select({
      conversationId: conversationReadState.conversationId,
      otherMemberId: otherMember.id,
      otherMemberName: otherMember.name,
      otherMemberBanned: otherMember.banned,
      latestMessageText: latestMessage.text,
      latestMessageSentAt: latestMessage.sentAt,
      unreadCount: unreadMessages.count
    })
    .from(conversationReadState)
    .innerJoin(directConversation, eq(directConversation.conversationId, conversationReadState.conversationId))
    .leftJoin(
      otherMember,
      or(
        and(eq(directConversation.firstMemberId, userId), eq(otherMember.id, directConversation.secondMemberId)),
        and(eq(directConversation.secondMemberId, userId), eq(otherMember.id, directConversation.firstMemberId))
      )
    )
    .innerJoinLateral(latestMessage, sql`true`)
    .innerJoinLateral(unreadMessages, sql`true`)
    .where(eq(conversationReadState.userId, userId))
    .orderBy(desc(latestMessage.sentAt))

  return toInboxConversations(rows)
}
