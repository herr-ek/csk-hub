import { describe, expect, mock, test } from "bun:test"

const markConversationRead = mock(async () => undefined)

class MessagingAccessError extends Error {}

mock.module("./service", () => ({
  MessagingAccessError,
  markConversationRead,
  sendMessage: mock(),
  startDirectConversation: mock()
}))

mock.module("next/cache", () => ({ revalidatePath: mock() }))

const { markConversationReadAction } = await import("./actions")

describe("markConversationReadAction", () => {
  test("advances a viewer's cursor only when the loaded Conversation explicitly marks its newest sequence", async () => {
    await markConversationReadAction("conversation-1", 4, "verified-token")

    expect(markConversationRead).toHaveBeenCalledWith("conversation-1", 4, "verified-token")
  })
})
