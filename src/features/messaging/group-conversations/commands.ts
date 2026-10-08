import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { conversation, conversationReadState, groupConversation, groupMembership } from "@/core/db/schema/messaging"
import { groupMemberIds, normalizeGroupName } from "../model/group-conversation"
import { MessagingAccessError } from "../model/messaging-error"
import type { MessageTransaction } from "../sending"
import { lockGroupConversation, requireActiveGroupMember } from "./access"

async function requireActiveUsers(tx: MessageTransaction, ids: string[]) {
  // Stable order avoids deadlocks when concurrent additions overlap.
  for (const id of ids) {
    const [member] = await tx.select({ banned: user.banned }).from(user).where(eq(user.id, id)).for("share").limit(1)
    if (!member) throw new MessagingAccessError("recipient-required")
    if (member.banned) throw new MessagingAccessError("recipient-inactive")
  }
}

export async function createGroupConversation(input: { name: unknown; memberIds: string[] }) {
  const userId = await requireAuthenticatedUser()
  const name = normalizeGroupName(input.name)
  const ids = groupMemberIds(input.memberIds, userId)
  return db.transaction(async (tx) => {
    await requireActiveUsers(tx, ids)
    const [created] = await tx.insert(conversation).values({ kind: "group" }).returning({ id: conversation.id })
    if (!created) throw new Error("Group Conversation creation did not return a record.")
    const conversationId = created.id
    await tx.insert(groupConversation).values({ conversationId, name, createdByUserId: userId })
    await tx.insert(groupMembership).values(ids.map((userId) => ({ conversationId, userId })))
    await tx.insert(conversationReadState).values(ids.map((userId) => ({ conversationId, userId })))
    return { conversationId }
  })
}

export async function addGroupMembers(input: { conversationId: string; memberIds: string[] }) {
  const userId = await requireAuthenticatedUser()
  const ids = groupMemberIds(input.memberIds)
  return db.transaction(async (tx) => {
    const row = await lockGroupConversation(tx, input.conversationId)
    await requireActiveGroupMember(tx, input.conversationId, userId)
    await requireActiveUsers(tx, ids)
    for (const memberId of ids) {
      const [added] = await tx
        .insert(groupMembership)
        .values({ conversationId: input.conversationId, userId: memberId })
        .onConflictDoUpdate({
          target: [groupMembership.conversationId, groupMembership.userId],
          set: { joinedAt: new Date(), leftAt: null, historyVisibleThroughSequence: null },
          setWhere: sql`${groupMembership.leftAt} IS NOT NULL`
        })
        .returning({ userId: groupMembership.userId })
      // Re-adding an existing active member must not reset their unread position.
      if (added)
        await tx
          .insert(conversationReadState)
          .values({
            conversationId: input.conversationId,
            userId: memberId,
            lastReadSequence: row.nextMessageSequence - 1
          })
          .onConflictDoUpdate({
            target: [conversationReadState.conversationId, conversationReadState.userId],
            set: { lastReadSequence: row.nextMessageSequence - 1 }
          })
    }
    return { conversationId: input.conversationId }
  })
}

export async function renameGroupConversation(input: { conversationId: string; name: unknown }) {
  const userId = await requireAuthenticatedUser()
  const name = normalizeGroupName(input.name)
  return db.transaction(async (tx) => {
    await lockGroupConversation(tx, input.conversationId)
    await requireActiveGroupMember(tx, input.conversationId, userId)
    await tx
      .update(groupConversation)
      .set({ name, updatedAt: new Date() })
      .where(eq(groupConversation.conversationId, input.conversationId))
    return { conversationId: input.conversationId }
  })
}

export async function leaveGroupConversation(conversationId: string) {
  const userId = await requireAuthenticatedUser()
  return db.transaction(async (tx) => {
    const row = await lockGroupConversation(tx, conversationId)
    await requireActiveGroupMember(tx, conversationId, userId)
    await tx
      .update(groupMembership)
      .set({ leftAt: new Date(), historyVisibleThroughSequence: row.nextMessageSequence - 1 })
      .where(and(eq(groupMembership.conversationId, conversationId), eq(groupMembership.userId, userId)))
    return { conversationId }
  })
}
