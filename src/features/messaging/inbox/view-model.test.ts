import { describe, expect, test } from "bun:test"
import { toInboxConversations } from "./view-model"

describe("Messages inbox", () => {
  test("orders Direct Conversations by their latest visible Message and exposes unread counts", () => {
    const conversations = toInboxConversations([
      {
        conversationId: "older",
        otherMemberName: "Ada",
        latestMessageText: "Earlier message",
        latestMessageSentAt: new Date("2026-09-01T09:00:00Z"),
        unreadCount: 1
      },
      {
        conversationId: "newer",
        otherMemberName: "Bea",
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
        readOnly: false
      },
      {
        id: "older",
        otherMemberName: "Ada",
        preview: "Earlier message",
        sentAt: new Date("2026-09-01T09:00:00Z"),
        unreadCount: 1,
        readOnly: false
      }
    ])
  })

  test("retains an erased counterpart as a read-only conversation for the screen to localize", () => {
    const [erased] = toInboxConversations([
      {
        conversationId: "erased",
        otherMemberName: null,
        latestMessageText: "Retained history",
        latestMessageSentAt: new Date("2026-09-02T09:00:00Z"),
        unreadCount: 0
      }
    ])

    expect(erased).toMatchObject({ otherMemberName: null, readOnly: true })
  })
})
