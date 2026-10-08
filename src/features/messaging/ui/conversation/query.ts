import "server-only"

import { and, asc, desc, eq, isNull, lt, lte } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import {
  conversation,
  directConversation,
  groupConversation,
  groupMembership,
  message
} from "@/core/db/schema/messaging"
import { canReceiveDirectMessages, getDirectCounterpartId } from "../../model/direct-conversation"
import { MessagingAccessError } from "../../model/messaging-error"
import { createReadToken } from "./read-token"

const MESSAGE_PAGE_SIZE = 50

/** Returns a direct conversation timeline window in chronological display order. */
async function getDirectConversationPage(conversationId: string, beforeSequence?: number) {
  const userId = await requireAuthenticatedUser()
  const [pair] = await db
    .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
    .from(directConversation)
    .where(eq(directConversation.conversationId, conversationId))
    .limit(1)

  if (!pair) throw new MessagingAccessError("conversation-not-found")

  const otherMemberId = getDirectCounterpartId(pair, userId)
  if (!otherMemberId) throw new MessagingAccessError("conversation-view-forbidden")

  const [otherMember] = otherMemberId
    ? await db.select({ name: user.name, banned: user.banned }).from(user).where(eq(user.id, otherMemberId)).limit(1)
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
      and(eq(message.conversationId, conversationId), beforeSequence ? lt(message.sequence, beforeSequence) : undefined)
    )
    .orderBy(desc(message.sequence))
    .limit(MESSAGE_PAGE_SIZE + 1)

  const hasOlder = rows.length > MESSAGE_PAGE_SIZE
  const messages = rows
    .slice(0, MESSAGE_PAGE_SIZE)
    .reverse()
    .map((row) => ({ ...row, authorName: null as string | null, isOwnMessage: row.authorUserId === userId }))

  const newestSequence = messages.at(-1)?.sequence ?? 0

  return {
    kind: "direct" as const,
    members: [] as { id: string; name: string }[],
    conversationId,
    otherMemberName: otherMember?.name ?? null,
    canSend: canReceiveDirectMessages({
      exists: Boolean(otherMember),
      banned: otherMember?.banned ?? false
    }),
    messages,
    hasOlder,
    nextBeforeSequence: hasOlder ? messages[0]?.sequence : undefined,
    newestSequence,
    readToken: newestSequence ? createReadToken(conversationId, userId, newestSequence) : undefined
  }
}

/** Group reads hold the same Conversation lock as departure until their window is loaded. */
async function getGroupConversationPage(conversationId: string, beforeSequence?: number) {
  const userId = await requireAuthenticatedUser()
  return db.transaction(async (tx) => {
    await tx.select({ id: conversation.id }).from(conversation).where(eq(conversation.id, conversationId)).for("share")
    const [membership] = await tx
      .select({
        name: groupConversation.name,
        leftAt: groupMembership.leftAt,
        visibleThrough: groupMembership.historyVisibleThroughSequence
      })
      .from(groupMembership)
      .innerJoin(groupConversation, eq(groupConversation.conversationId, groupMembership.conversationId))
      .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
      .limit(1)
    if (!membership) throw new MessagingAccessError("conversation-view-forbidden")
    const rows = await tx
      .select({
        id: message.id,
        sequence: message.sequence,
        text: message.text,
        sentAt: message.sentAt,
        authorUserId: message.authorUserId,
        authorName: user.name
      })
      .from(message)
      .leftJoin(user, eq(user.id, message.authorUserId))
      .where(
        and(
          eq(message.conversationId, conversationId),
          membership.visibleThrough !== null ? lte(message.sequence, membership.visibleThrough) : undefined,
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
    const canSend = membership.leftAt === null
    const members = canSend
      ? await tx
          .select({ id: user.id, name: user.name })
          .from(groupMembership)
          .innerJoin(user, eq(user.id, groupMembership.userId))
          .where(and(eq(groupMembership.conversationId, conversationId), isNull(groupMembership.leftAt)))
          .orderBy(asc(user.name), asc(user.id))
      : []
    return {
      kind: "group" as const,
      conversationId,
      otherMemberName: membership.name,
      canSend,
      members,
      messages,
      hasOlder,
      nextBeforeSequence: hasOlder ? messages[0]?.sequence : undefined,
      newestSequence,
      readToken: newestSequence ? createReadToken(conversationId, userId, newestSequence) : undefined
    }
  })
}

export async function getConversationPage(conversationId: string, beforeSequence?: number) {
  const [group] = await db
    .select({ id: groupConversation.conversationId })
    .from(groupConversation)
    .where(eq(groupConversation.conversationId, conversationId))
    .limit(1)
  return group
    ? getGroupConversationPage(conversationId, beforeSequence)
    : getDirectConversationPage(conversationId, beforeSequence)
}
