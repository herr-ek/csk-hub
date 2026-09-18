import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { conversationReadState, directConversation } from "@/core/db/schema/messaging"
import { getDirectCounterpartId } from "../direct/membership"
import { MessagingAccessError } from "../errors"
import { verifiesReadToken } from "./read-token"

export async function markConversationRead(conversationId: string, sequence: number, token: string) {
  const userId = await requireAuthenticatedUser()

  if (!Number.isInteger(sequence) || sequence < 1 || !verifiesReadToken(token, conversationId, userId, sequence))
    throw new MessagingAccessError("read-position-invalid")

  const [pair] = await db
    .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
    .from(directConversation)
    .where(eq(directConversation.conversationId, conversationId))
    .limit(1)

  if (!pair || !getDirectCounterpartId(pair, userId)) throw new MessagingAccessError("conversation-view-forbidden")

  await db
    .update(conversationReadState)
    .set({ lastReadSequence: sql`GREATEST(${conversationReadState.lastReadSequence}, ${sequence})` })
    .where(and(eq(conversationReadState.conversationId, conversationId), eq(conversationReadState.userId, userId)))
}
