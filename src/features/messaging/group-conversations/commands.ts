import "server-only"

import { createHash } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversation, conversationReadState, groupConversation, groupMembership } from "@/core/db/schema/messaging"
import { queueConversationActivity } from "../activity"
import { groupMemberIds, normalizeGroupName } from "../model/group-conversation"
import { MessagingAccessError } from "../model/messaging-error"
import type { MessageTransaction } from "../sending"
import { lockGroupConversation, requireActiveGroupMember } from "./access"

async function requireActiveUsers(tx: MessageTransaction, ids: string[]) {
  // Stable order avoids deadlocks when concurrent additions overlap.
  const members = await tx
    .select({ id: user.id, banned: user.banned })
    .from(user)
    .where(inArray(user.id, ids))
    .orderBy(user.id)
    .for("share")
  const membersById = new Map(members.map((member) => [member.id, member]))
  for (const id of ids) {
    const member = membersById.get(id)
    if (!member) throw new MessagingAccessError("recipient-required")
    if (member.banned) throw new MessagingAccessError("recipient-inactive")
  }
}

export async function createGroupConversation(input: { name: unknown; memberIds: string[]; idempotencyKey: string }) {
  const userId = await requireAuthenticatedUser()
  const name = normalizeGroupName(input.name)
  const ids = groupMemberIds(input.memberIds, userId)
  if (!input.idempotencyKey.trim()) throw new MessagingAccessError("idempotency-key-required")
  const payloadHash = createHash("sha256")
    .update(JSON.stringify([name, ids]))
    .digest("hex")
  return db.transaction(async (tx) => {
    // Serialize retries for this creator/key before checking whether the original intent committed.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${JSON.stringify(["group-creation", userId, input.idempotencyKey])}))`
    )
    const [existing] = await tx
      .select({ conversationId: groupConversation.conversationId, payloadHash: groupConversation.creationPayloadHash })
      .from(groupConversation)
      .where(
        and(
          eq(groupConversation.createdByUserId, userId),
          eq(groupConversation.creationIdempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new MessagingAccessError("idempotency-key-reused")
      return { conversationId: existing.conversationId }
    }
    await requireActiveUsers(tx, ids)
    const [created] = await tx.insert(conversation).values({ kind: "group" }).returning({ id: conversation.id })
    if (!created) throw new Error("Group Conversation creation did not return a record.")
    const conversationId = created.id
    await tx.insert(groupConversation).values({
      conversationId,
      name,
      createdByUserId: userId,
      creationIdempotencyKey: input.idempotencyKey,
      creationPayloadHash: payloadHash
    })
    await tx.insert(groupMembership).values(ids.map((userId) => ({ conversationId, userId })))
    await tx.insert(conversationReadState).values(ids.map((userId) => ({ conversationId, userId })))
    await queueConversationActivity(tx, conversationId)
    return { conversationId }
  })
}

export async function addGroupMembers(input: { conversationId: string; memberIds: string[] }) {
  const userId = await requireAuthenticatedUser()
  const ids = groupMemberIds(input.memberIds)
  return db.transaction(async (tx) => {
    const row = await lockGroupConversation(tx, input.conversationId)
    await requireActiveGroupMember(tx, input.conversationId, userId, "group-management-forbidden")
    await requireActiveUsers(tx, ids)
    const added = await tx
      .insert(groupMembership)
      .values(ids.map((userId) => ({ conversationId: input.conversationId, userId })))
      .onConflictDoUpdate({
        target: [groupMembership.conversationId, groupMembership.userId],
        set: { joinedAt: new Date(), leftAt: null, historyVisibleThroughSequence: null },
        setWhere: sql`${groupMembership.leftAt} IS NOT NULL`
      })
      .returning({ userId: groupMembership.userId })
    // Only new or rejoined memberships are returned; active members keep their unread position.
    if (added.length)
      await tx
        .insert(conversationReadState)
        .values(
          added.map(({ userId }) => ({
            conversationId: input.conversationId,
            userId,
            lastReadSequence: row.nextMessageSequence - 1
          }))
        )
        .onConflictDoUpdate({
          target: [conversationReadState.conversationId, conversationReadState.userId],
          set: { lastReadSequence: row.nextMessageSequence - 1 }
        })
    await queueConversationActivity(tx, input.conversationId)
    return { conversationId: input.conversationId }
  })
}

export async function renameGroupConversation(input: { conversationId: string; name: unknown }) {
  const userId = await requireAuthenticatedUser()
  const name = normalizeGroupName(input.name)
  return db.transaction(async (tx) => {
    await lockGroupConversation(tx, input.conversationId)
    await requireActiveGroupMember(tx, input.conversationId, userId, "group-management-forbidden")
    await tx
      .update(groupConversation)
      .set({ name, updatedAt: new Date() })
      .where(eq(groupConversation.conversationId, input.conversationId))
    await queueConversationActivity(tx, input.conversationId)
    return { conversationId: input.conversationId }
  })
}

export async function leaveGroupConversation(conversationId: string) {
  const userId = await requireAuthenticatedUser()
  return db.transaction(async (tx) => {
    const row = await lockGroupConversation(tx, conversationId)
    await requireActiveGroupMember(tx, conversationId, userId, "group-management-forbidden")
    await tx
      .update(groupMembership)
      .set({ leftAt: new Date(), historyVisibleThroughSequence: row.nextMessageSequence - 1 })
      .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
    await queueConversationActivity(tx, conversationId, userId)
    return { conversationId }
  })
}
