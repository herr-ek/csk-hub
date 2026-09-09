import "server-only"

import { and, asc, desc, eq, gt, isNull, lt, max, ne, or, sql } from "drizzle-orm"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversation, conversationMembership, directConversation, message } from "@/core/db/schema/messaging"
import { validateMessageBody } from "./message-body"
import { currentMessagingActor, isActiveMember, MessagingAccessError } from "./messaging-access"
import { createReadToken, verifiesReadToken } from "./read-token"

export { MessagingAccessError } from "./messaging-access"

export async function searchActiveMembers(query: string) {
  const actor = await currentMessagingActor()
  const search = query.trim()
  if (!search) return []
  const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`

  return db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user)
    .where(
      and(
        ne(user.id, actor.userId),
        isActiveMember(),
        or(sql`${user.name} ILIKE ${pattern}`, sql`${user.username} ILIKE ${pattern}`)
      )
    )
    .orderBy(asc(user.name), asc(user.username))
    .limit(20)
}

type SendMessageInput = { recipientId: string; text: unknown; idempotencyKey: string }

export async function startDirectConversation(input: SendMessageInput) {
  const actor = await currentMessagingActor()
  const body = validateMessageBody(input.text)
  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.recipientId.trim()) throw new MessagingAccessError("Choose a recipient.")
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("Unable to send this message. Please try again.")
  if (actor.userId === input.recipientId)
    throw new MessagingAccessError("You cannot start a Conversation with yourself.")

  return db.transaction(async (tx) => {
    const [retry] = await tx
      .select({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
      .from(message)
      .where(and(eq(message.authorUserId, actor.userId), eq(message.idempotencyKey, input.idempotencyKey)))
      .limit(1)
    if (retry) return { ...retry, created: false }

    const [recipient] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.recipientId), isActiveMember()))
      .limit(1)
    if (!recipient) throw new MessagingAccessError("That recipient is no longer active.")

    const [firstMemberId, secondMemberId] = [actor.userId, recipient.id].sort()
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${firstMemberId}:${secondMemberId}`}))`)

    const [existing] = await tx
      .select({ conversationId: directConversation.conversationId })
      .from(directConversation)
      .where(
        and(eq(directConversation.firstMemberId, firstMemberId), eq(directConversation.secondMemberId, secondMemberId))
      )
      .limit(1)

    const [lockedRetry] = await tx
      .select({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
      .from(message)
      .where(and(eq(message.authorUserId, actor.userId), eq(message.idempotencyKey, input.idempotencyKey)))
      .limit(1)
    if (lockedRetry) return { ...lockedRetry, created: false }

    let conversationId = existing?.conversationId
    if (!conversationId) {
      const [created] = await tx
        .insert(conversation)
        .values({ kind: "direct", createdByUserId: actor.userId })
        .returning({ id: conversation.id })
      if (!created) throw new Error("Conversation creation did not return a record.")
      conversationId = created.id
      await tx.insert(directConversation).values({ conversationId, firstMemberId, secondMemberId })
      await tx.insert(conversationMembership).values([
        { conversationId, userId: actor.userId },
        { conversationId, userId: recipient.id }
      ])
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${conversationId}))`)
    const [latest] = await tx
      .select({ sequence: max(message.sequence) })
      .from(message)
      .where(eq(message.conversationId, conversationId))
    const sequence = (latest?.sequence ?? 0) + 1
    const [createdMessage] = await tx
      .insert(message)
      .values({
        conversationId,
        sequence,
        authorUserId: actor.userId,
        text: body.data,
        idempotencyKey: input.idempotencyKey
      })
      .returning({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
    if (!createdMessage) throw new Error("Message creation did not return a record.")
    await tx
      .update(conversationMembership)
      .set({ lastReadSequence: sequence })
      .where(
        and(
          eq(conversationMembership.conversationId, conversationId),
          eq(conversationMembership.userId, actor.userId),
          isNull(conversationMembership.leftAt)
        )
      )
    return { ...createdMessage, created: true }
  })
}

export async function sendMessage(input: { conversationId: string; text: unknown; idempotencyKey: string }) {
  const actor = await currentMessagingActor()
  const body = validateMessageBody(input.text)
  if (!body.success) throw new MessagingAccessError(body.error)
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("Unable to send this message. Please try again.")

  return db.transaction(async (tx) => {
    const [retry] = await tx
      .select({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
      .from(message)
      .where(and(eq(message.authorUserId, actor.userId), eq(message.idempotencyKey, input.idempotencyKey)))
      .limit(1)
    if (retry) return { ...retry, created: false }

    const [membership] = await tx
      .select({ conversationId: conversationMembership.conversationId })
      .from(conversationMembership)
      .where(
        and(
          eq(conversationMembership.conversationId, input.conversationId),
          eq(conversationMembership.userId, actor.userId),
          isNull(conversationMembership.leftAt)
        )
      )
      .limit(1)
    if (!membership) throw new MessagingAccessError("You cannot send Messages in this Conversation.")

    const [pair] = await tx
      .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
      .from(directConversation)
      .where(eq(directConversation.conversationId, input.conversationId))
      .limit(1)
    if (!pair) throw new MessagingAccessError("This Conversation cannot receive Messages.")
    const recipientId = pair.firstMemberId === actor.userId ? pair.secondMemberId : pair.firstMemberId
    if (!recipientId) throw new MessagingAccessError("This Conversation is read-only.")
    const [recipient] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, recipientId), isActiveMember()))
      .limit(1)
    if (!recipient) throw new MessagingAccessError("This Conversation is read-only while the other Member is inactive.")

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.conversationId}))`)
    const [lockedRetry] = await tx
      .select({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
      .from(message)
      .where(and(eq(message.authorUserId, actor.userId), eq(message.idempotencyKey, input.idempotencyKey)))
      .limit(1)
    if (lockedRetry) return { ...lockedRetry, created: false }
    const [latest] = await tx
      .select({ sequence: max(message.sequence) })
      .from(message)
      .where(eq(message.conversationId, input.conversationId))
    const sequence = (latest?.sequence ?? 0) + 1
    const [created] = await tx
      .insert(message)
      .values({
        conversationId: input.conversationId,
        sequence,
        authorUserId: actor.userId,
        text: body.data,
        idempotencyKey: input.idempotencyKey
      })
      .returning({ id: message.id, conversationId: message.conversationId, sequence: message.sequence })
    if (!created) throw new Error("Message creation did not return a record.")
    await tx
      .update(conversationMembership)
      .set({ lastReadSequence: sequence })
      .where(
        and(
          eq(conversationMembership.conversationId, input.conversationId),
          eq(conversationMembership.userId, actor.userId),
          isNull(conversationMembership.leftAt)
        )
      )
    return { ...created, created: true }
  })
}

export async function getDirectConversation(conversationId: string, beforeSequence?: number) {
  const actor = await currentMessagingActor()
  const [membership] = await db
    .select({ historyVisibleFromSequence: conversationMembership.historyVisibleFromSequence })
    .from(conversationMembership)
    .where(
      and(
        eq(conversationMembership.conversationId, conversationId),
        eq(conversationMembership.userId, actor.userId),
        isNull(conversationMembership.leftAt)
      )
    )
    .limit(1)
  if (!membership) throw new MessagingAccessError("You cannot view this Conversation.")

  const [pair] = await db
    .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
    .from(directConversation)
    .where(eq(directConversation.conversationId, conversationId))
    .limit(1)
  if (!pair) throw new MessagingAccessError("That Conversation could not be found.")
  const otherMemberId = pair.firstMemberId === actor.userId ? pair.secondMemberId : pair.firstMemberId
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
      and(
        eq(message.conversationId, conversationId),
        isNull(message.deletedAt),
        gt(message.sequence, membership.historyVisibleFromSequence - 1),
        beforeSequence ? lt(message.sequence, beforeSequence) : undefined
      )
    )
    .orderBy(desc(message.sequence))
    .limit(51)
  const hasOlder = rows.length > 50
  const messages = rows.slice(0, 50).map((row) => ({
    ...row,
    isOwnMessage: row.authorUserId === actor.userId
  }))
  const newestSequence = messages[0]?.sequence ?? 0
  return {
    conversationId,
    otherMemberName: otherMember?.name ?? "Former member",
    readOnly: !otherMember || Boolean(otherMember.banned),
    messages,
    olderCursor: hasOlder ? messages[0]?.sequence : undefined,
    newestSequence,
    readToken: newestSequence ? createReadToken(conversationId, actor.userId, newestSequence) : undefined
  }
}

export async function markConversationRead(conversationId: string, sequence: number, token: string) {
  const actor = await currentMessagingActor()
  if (!Number.isInteger(sequence) || sequence < 1 || !verifiesReadToken(token, conversationId, actor.userId, sequence))
    throw new MessagingAccessError("That read position is invalid.")
  const [membership] = await db
    .select({ historyVisibleFromSequence: conversationMembership.historyVisibleFromSequence })
    .from(conversationMembership)
    .where(
      and(
        eq(conversationMembership.conversationId, conversationId),
        eq(conversationMembership.userId, actor.userId),
        isNull(conversationMembership.leftAt)
      )
    )
    .limit(1)
  if (!membership) throw new MessagingAccessError("You cannot view this Conversation.")
  await db
    .update(conversationMembership)
    .set({ lastReadSequence: sql`GREATEST(${conversationMembership.lastReadSequence}, ${sequence})` })
    .where(
      and(
        eq(conversationMembership.conversationId, conversationId),
        eq(conversationMembership.userId, actor.userId),
        isNull(conversationMembership.leftAt)
      )
    )
}
