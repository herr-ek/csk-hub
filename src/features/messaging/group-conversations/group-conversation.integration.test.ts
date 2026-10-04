import { expect, mock, test } from "bun:test"
import { eq, inArray } from "drizzle-orm"
import { isLocalDatabase } from "@/core/db/tls"

// Run separately: MESSAGING_INTEGRATION_TEST=1 bun test <this-file>
// Uses disposable fixtures and refuses a non-local database.
const integration = process.env.MESSAGING_INTEGRATION_TEST === "1" ? test : test.skip

integration(
  "Group Conversation membership, history, unread state and concurrent departure",
  async () => {
    if (!process.env.POSTGRES_URL || !isLocalDatabase(process.env.POSTGRES_URL))
      throw new Error("Messaging integration verification requires a local database.")
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID())
    const [alice, bob, carol, outsider] = ids
    let viewer = alice
    mock.module("@/core/auth/session.server", () => ({ requireAuthenticatedUser: async () => viewer }))
    const { db } = await import("@/core/db")
    const { user } = await import("@/core/db/schema/auth")
    const { conversation } = await import("@/core/db/schema/messaging")
    const { createGroupConversation, addGroupMembers, leaveGroupConversation, renameGroupConversation } = await import(
      "./commands"
    )
    const { sendMessage } = await import("../sending/send-message")
    const { getConversationPage } = await import("../ui/conversation/query")
    const { listConversations } = await import("../ui/inbox/query")
    const { markConversationRead } = await import("../ui/conversation/read")
    const { createReadToken } = await import("../ui/conversation/read-token")
    let conversationId: string | undefined
    const send = (text: string) =>
      sendMessage({ conversationId: conversationId as string, text, idempotencyKey: crypto.randomUUID() })
    try {
      await db
        .insert(user)
        .values(
          ids.map((id, index) => ({ id, name: `Messaging verification ${index}`, email: `${id}@example.invalid` }))
        )
      const created = await createGroupConversation({ name: "Membership verification", memberIds: [bob] })
      conversationId = created.conversationId
      const groupId = conversationId
      expect((await listConversations()).find((item) => item.id === groupId)?.preview).toBeNull()
      await send("Before departure")
      await addGroupMembers({ conversationId: groupId, memberIds: [carol] })
      viewer = carol
      expect((await getConversationPage(groupId)).messages.map((item) => item.text)).toEqual(["Before departure"])
      expect((await listConversations()).find((item) => item.id === groupId)?.unreadCount).toBe(0)

      viewer = outsider
      await expect(getConversationPage(groupId)).rejects.toMatchObject({ kind: "conversation-view-forbidden" })
      await expect(send("Not permitted")).rejects.toMatchObject({ kind: "conversation-send-forbidden" })
      expect((await listConversations()).some((item) => item.id === groupId)).toBe(false)

      viewer = bob
      await leaveGroupConversation(groupId)
      viewer = alice
      await send("After departure")
      await renameGroupConversation({ conversationId: groupId, name: "Renamed verification" })
      viewer = bob
      const former = await getConversationPage(groupId)
      expect(former.messages.map((item) => item.text)).toEqual(["Before departure"])
      expect(former.members).toEqual([])
      expect(former.otherMemberName).toBe("Renamed verification")
      expect(former.canSend).toBe(false)
      const inbox = (await listConversations()).find((item) => item.id === groupId)
      expect(inbox?.preview).toBe("Before departure")
      expect(inbox?.unreadCount).toBe(1)
      await markConversationRead(groupId, 1, former.readToken as string)
      expect((await listConversations()).find((item) => item.id === groupId)?.unreadCount).toBe(0)
      await expect(markConversationRead(groupId, 2, createReadToken(groupId, bob, 2))).rejects.toMatchObject({
        kind: "conversation-view-forbidden"
      })
      await expect(send("Not permitted after leaving")).rejects.toMatchObject({ kind: "conversation-send-forbidden" })
      await expect(addGroupMembers({ conversationId: groupId, memberIds: [bob] })).rejects.toMatchObject({
        kind: "conversation-send-forbidden"
      })

      viewer = alice
      await addGroupMembers({ conversationId: groupId, memberIds: [bob] })
      viewer = bob
      expect((await getConversationPage(groupId)).messages).toHaveLength(2)
      expect((await listConversations()).find((item) => item.id === groupId)?.unreadCount).toBe(0)
      viewer = alice
      await send("After rejoining")
      await addGroupMembers({ conversationId: groupId, memberIds: [bob] })
      viewer = bob
      expect((await listConversations()).find((item) => item.id === groupId)?.unreadCount).toBe(1)
      const results = await Promise.allSettled([send("Concurrent departure"), leaveGroupConversation(groupId)])
      expect(results[1].status).toBe("fulfilled")
      const departed = await getConversationPage(groupId)
      expect(departed.messages).toHaveLength(results[0].status === "fulfilled" ? 4 : 3)
      viewer = alice
      await send("Strictly after concurrent departure")
      viewer = bob
      expect((await getConversationPage(groupId)).messages).toHaveLength(departed.messages.length)
      expect((await getConversationPage(groupId, 3)).messages.map((item) => item.sequence)).toEqual([1, 2])

      // Erasure retains the conversation and identity-free Message authorship.
      await db.delete(user).where(eq(user.id, alice))
      viewer = carol
      const erased = await getConversationPage(groupId)
      expect(erased.messages[0].authorUserId).toBeNull()
      expect(erased.messages[0].authorName).toBeNull()
      await send("Sole active member can send")
      await leaveGroupConversation(groupId)
      await expect(addGroupMembers({ conversationId: groupId, memberIds: [bob] })).rejects.toMatchObject({
        kind: "conversation-send-forbidden"
      })
      expect((await getConversationPage(groupId)).canSend).toBe(false)
    } finally {
      if (conversationId) await db.delete(conversation).where(eq(conversation.id, conversationId))
      await db.delete(user).where(inArray(user.id, ids))
      await db.$client.end()
    }
  },
  30000
)
