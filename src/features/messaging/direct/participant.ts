import "server-only"

import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { directConversation } from "@/core/db/schema/messaging"
import { MessagingAccessError } from "../errors"
import { canReceiveDirectMessages } from "./capability"
import { getDirectCounterpartId } from "./membership"
import type { DirectTransaction } from "./write"

/** Locks and validates a prospective direct-message recipient. */
export async function requireActiveDirectRecipient(tx: DirectTransaction, recipientId: string) {
  const [recipient] = await tx
    .select({ id: user.id, banned: user.banned })
    .from(user)
    .where(eq(user.id, recipientId))
    .for("update")
    .limit(1)

  if (!recipient) throw new MessagingAccessError("recipient-required")
  if (recipient.banned) throw new MessagingAccessError("recipient-inactive")

  return recipient.id
}

/**
 * Resolves the active counterpart for a direct conversation while holding its user row lock.
 *
 * The lock makes the active-recipient decision part of the write transaction: a ban cannot slip
 * between authorization and persistence. Direct-pair membership, rather than read state, grants
 * authority to send.
 */
export async function resolveActiveDirectCounterpart(
  tx: DirectTransaction,
  conversationId: string,
  senderUserId: string
) {
  const [pair] = await tx
    .select({ firstMemberId: directConversation.firstMemberId, secondMemberId: directConversation.secondMemberId })
    .from(directConversation)
    .where(eq(directConversation.conversationId, conversationId))
    .limit(1)

  if (!pair) throw new MessagingAccessError("conversation-unavailable")

  const otherMemberId = getDirectCounterpartId(pair, senderUserId)
  if (!otherMemberId) throw new MessagingAccessError("conversation-send-forbidden")

  const [otherMember] = await tx
    .select({ id: user.id, banned: user.banned })
    .from(user)
    .where(eq(user.id, otherMemberId))
    .for("update")
    .limit(1)

  if (
    !canReceiveDirectMessages({
      exists: Boolean(otherMember),
      banned: otherMember?.banned ?? false
    })
  )
    throw new MessagingAccessError("conversation-recipient-inactive")

  return otherMember.id
}
