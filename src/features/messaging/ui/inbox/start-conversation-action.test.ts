import { beforeEach, expect, mock, test } from "bun:test"

const direct = mock(async () => ({ conversationId: "direct-1" }))
const group = mock(async () => ({ conversationId: "group-1" }))
const getSession = mock(async () => ({ session: { impersonatedBy: null as string | null } }))
mock.module("../../sending", () => ({ startDirectConversation: direct, sendMessage: mock() }))
mock.module("../../group-conversations", () => ({
  createGroupConversation: group,
  addGroupMembers: mock(),
  renameGroupConversation: mock(),
  leaveGroupConversation: mock(),
  requireActiveGroupMember: mock()
}))
mock.module("./member-search", () => ({ searchMembers: mock() }))
mock.module("@/core/auth", () => ({ auth: { api: { getSession } } }))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("next/cache", () => ({ revalidatePath: mock() }))
const { startConversationAction } = await import("./actions")
beforeEach(() => {
  direct.mockClear()
  group.mockClear()
  getSession.mockResolvedValue({ session: { impersonatedBy: null } })
})
function form(members: string[]) {
  const data = new FormData()
  for (const id of members) data.append("memberIds", id)
  data.set("text", "Hello")
  data.set("name", "Planning")
  data.set("idempotencyKey", "intent-1")
  return data
}
test("one unique selected member starts a Direct Conversation with its first Message", async () => {
  await expect(startConversationAction({ status: "idle" }, form(["member-1", "member-1"]))).resolves.toMatchObject({
    conversationId: "direct-1"
  })
  expect(direct).toHaveBeenCalledWith({ recipientId: "member-1", text: "Hello", idempotencyKey: "intent-1" })
  expect(group).not.toHaveBeenCalled()
})
test("multiple selected members create a named Group Conversation", async () => {
  await expect(startConversationAction({ status: "idle" }, form(["member-1", "member-2"]))).resolves.toMatchObject({
    conversationId: "group-1"
  })
  expect(group).toHaveBeenCalledWith({ name: "Planning", memberIds: ["member-1", "member-2"] })
  expect(direct).not.toHaveBeenCalled()
})
test("no selected members cannot create a Conversation", async () => {
  await expect(startConversationAction({ status: "idle" }, form([]))).resolves.toMatchObject({
    status: "error",
    error: "recipient-required"
  })
  expect(direct).not.toHaveBeenCalled()
  expect(group).not.toHaveBeenCalled()
})
test("unified creation blocks support impersonation for both kinds", async () => {
  getSession.mockResolvedValue({ session: { impersonatedBy: "admin" } })
  for (const ids of [["member-1"], ["member-1", "member-2"]])
    await expect(startConversationAction({ status: "idle" }, form(ids))).resolves.toMatchObject({
      status: "error",
      error: "impersonation-unavailable"
    })
  expect(direct).not.toHaveBeenCalled()
  expect(group).not.toHaveBeenCalled()
})
