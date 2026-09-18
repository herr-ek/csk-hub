import "server-only"

import { and, desc, eq, lt } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { directConversation, message } from "@/core/db/schema/messaging"
import { canReceiveDirectMessages } from "../direct/capability"
import { getDirectCounterpartId } from "../direct/membership"
import { MessagingAccessError } from "../errors"
import { createReadToken } from "./read-token"

const MESSAGE_PAGE_SIZE = 50

/** Returns a direct conversation timeline window in chronological display order. */
export async function getDirectConversationPage(conversationId: string, beforeSequence?: number) {
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
    .map((row) => ({ ...row, isOwnMessage: row.authorUserId === userId }))

  const newestSequence = messages.at(-1)?.sequence ?? 0

  return {
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
