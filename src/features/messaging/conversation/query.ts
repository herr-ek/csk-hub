import "server-only"

import { and, desc, eq, gt, isNull, lt } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversationMembership, directConversation, message } from "@/core/db/schema/messaging"
import { currentMessagingUserId, MessagingAccessError } from "../access"
import { createReadToken } from "./read-token"

const MESSAGE_PAGE_SIZE = 50

/** Returns a direct conversation timeline window in chronological display order. */
export async function getDirectConversationPage(conversationId: string, beforeSequence?: number) {
  const userId = await currentMessagingUserId()
  const [membership] = await db
    .select({ historyVisibleFromSequence: conversationMembership.historyVisibleFromSequence })
    .from(conversationMembership)
    .where(
      and(
        eq(conversationMembership.conversationId, conversationId),
        eq(conversationMembership.userId, userId),
        isNull(conversationMembership.leftAt)
      )
    )
    .limit(1)
  if (!membership) throw new MessagingAccessError("conversation-view-forbidden")

  const [pair] = await db
    .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
    .from(directConversation)
    .where(eq(directConversation.conversationId, conversationId))
    .limit(1)
  if (!pair) throw new MessagingAccessError("conversation-not-found")
  const otherMemberId = pair.firstMemberId === userId ? pair.secondMemberId : pair.firstMemberId
  const [otherMember] = otherMemberId
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, otherMemberId)).limit(1)
    : []

  const rows = await db
    .select({
      id: message.id,
      sequence: message.sequence,
      text: message.text,
      sentAt: message.sentAt,
      authorUserId: message.authorUserId
    })
    .from(message)
    .where(
      and(
        eq(message.conversationId, conversationId),
        isNull(message.deletedAt),
        gt(message.sequence, membership.historyVisibleFromSequence - 1),
        beforeSequence ? lt(message.sequence, beforeSequence) : undefined
      )
    )
    .orderBy(desc(message.sequence))
    .limit(MESSAGE_PAGE_SIZE + 1)
  const hasOlder = rows.length > MESSAGE_PAGE_SIZE
  const messages = rows
    .slice(0, MESSAGE_PAGE_SIZE)
    .reverse()
    .map((row) => ({ ...row, isOwnMessage: row.authorUserId === userId }))
  const newestSequence = messages.at(-1)?.sequence ?? 0

  return {
    conversationId,
    otherMemberName: otherMember?.name ?? null,
    readOnly: !otherMember,
    messages,
    hasOlder,
    nextBeforeSequence: hasOlder ? messages[0]?.sequence : undefined,
    newestSequence,
    readToken: newestSequence ? createReadToken(conversationId, userId, newestSequence) : undefined
  }
}
