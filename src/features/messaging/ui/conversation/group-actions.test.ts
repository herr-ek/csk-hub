import { beforeEach, expect, mock, test } from "bun:test"

const getSession = mock(async () => ({ session: { impersonatedBy: null as string | null } }))
const command = mock(async () => ({ conversationId: "group-1" }))
const revalidatePath = mock()
mock.module("@/core/auth/session.server", () => ({
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  getRequestSession: getSession
}))
mock.module("next/cache", () => ({ revalidatePath }))
mock.module("../../group-conversations", () => ({
  createGroupConversation: command,
  addGroupMembers: command,
  renameGroupConversation: command,
  leaveGroupConversation: command
}))
const { groupConversationAction } = await import("./group-actions")
beforeEach(() => {
  getSession.mockResolvedValue({ session: { impersonatedBy: null } })
  command.mockClear()
  revalidatePath.mockClear()
})

test("group creation forwards the form's idempotency key", async () => {
  const form = new FormData()
  form.set("operation", "create")
  form.set("name", "Planning")
  form.append("memberIds", "member-1")
  form.set("idempotencyKey", "intent-1")
  await expect(groupConversationAction({ status: "idle" }, form)).resolves.toMatchObject({
    status: "success",
    conversationId: "group-1"
  })
  expect(command).toHaveBeenCalledWith({ name: "Planning", memberIds: ["member-1"], idempotencyKey: "intent-1" })
})

test("all Group Conversation mutations refuse support impersonation", async () => {
  getSession.mockResolvedValue({ session: { impersonatedBy: "admin" } })
  for (const operation of ["create", "add", "rename", "leave"]) {
    const form = new FormData()
    form.set("operation", operation)
    form.set("conversationId", "group-1")
    await expect(groupConversationAction({ status: "idle" }, form)).resolves.toMatchObject({
      status: "error",
      error: "impersonation-unavailable"
    })
  }
  expect(command).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
})

test("adding members forwards every selection and invalidates the rewritten inbox and timeline routes", async () => {
  const form = new FormData()
  form.set("operation", "add")
  form.set("conversationId", "group-1")
  form.append("memberIds", "member-1")
  form.append("memberIds", "member-2")
  await expect(groupConversationAction({ status: "idle" }, form)).resolves.toEqual({
    status: "success",
    conversationId: "group-1"
  })
  expect(command).toHaveBeenCalledWith({ conversationId: "group-1", memberIds: ["member-1", "member-2"] })
  expect(revalidatePath).toHaveBeenCalledWith("/[locale]/(app)/messages", "page")
  expect(revalidatePath).toHaveBeenCalledWith("/[locale]/(app)/messages/[conversationId]", "page")
})
