import { describe, expect, test } from "bun:test"
import { toInboxConversations } from "./view-model"

describe("Messages inbox", () => {
  test("orders Direct Conversations by their latest visible Message and exposes unread counts", () => {
    const conversations = toInboxConversations([
      {
        conversationId: "older",
        otherMemberId: "ada",
        otherMemberName: "Ada",
        otherMemberBanned: false,
        latestMessageText: "Earlier message",
        latestMessageSentAt: new Date("2026-09-01T09:00:00Z"),
        unreadCount: 1
      },
      {
        conversationId: "newer",
        otherMemberId: "bea",
        otherMemberName: "Bea",
        otherMemberBanned: false,
        latestMessageText: "Most recent message",
        latestMessageSentAt: new Date("2026-09-02T09:00:00Z"),
        unreadCount: 3
      }
    ])

    expect(conversations).toEqual([
      {
        id: "newer",
        otherMemberName: "Bea",
        preview: "Most recent message",
        sentAt: new Date("2026-09-02T09:00:00Z"),
        unreadCount: 3,
        canSend: true
      },
      {
        id: "older",
        otherMemberName: "Ada",
        preview: "Earlier message",
        sentAt: new Date("2026-09-01T09:00:00Z"),
        unreadCount: 1,
        canSend: true
      }
    ])
  })

  test("retains an erased counterpart as a read-only conversation for the screen to localize", () => {
    const [erased] = toInboxConversations([
      {
        conversationId: "erased",
        otherMemberId: null,
        otherMemberName: null,
        otherMemberBanned: null,
        latestMessageText: "Retained history",
        latestMessageSentAt: new Date("2026-09-02T09:00:00Z"),
        unreadCount: 0
      }
    ])

    expect(erased).toMatchObject({ otherMemberName: null, canSend: false })
  })

  test("makes an inactive counterpart read-only before the member opens the thread", () => {
    const [inactive] = toInboxConversations([
      {
        conversationId: "inactive",
        otherMemberId: "bea",
        otherMemberName: "Bea",
        otherMemberBanned: true,
        latestMessageText: "Retained history",
        latestMessageSentAt: new Date("2026-09-02T09:00:00Z"),
        unreadCount: 0
      }
    ])

    expect(inactive).toMatchObject({ otherMemberName: "Bea", canSend: false })
  })
})
