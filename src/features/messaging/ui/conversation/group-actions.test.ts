import { beforeEach, expect, mock, test } from "bun:test"
import { AuthorizationDeniedError } from "@/core/authz/authorization"

const command = mock(async () => ({ conversationId: "group-1" }))
const revalidatePath = mock()

mock.module("next/cache", () => ({ revalidatePath }))
mock.module("../../group-conversations", () => ({
  addGroupMembers: command,
  renameGroupConversation: command,
  leaveGroupConversation: command
}))

const { groupConversationAction } = await import("./group-actions")
beforeEach(() => {
  command.mockReset().mockResolvedValue({ conversationId: "group-1" })
  revalidatePath.mockClear()
})

test("all Group Conversation mutations report missing authentication", async () => {
  const denied = new AuthorizationDeniedError({ action: "app.access" }, null)
  command.mockRejectedValue(denied)
  for (const operation of ["add", "rename", "leave"]) {
    const form = new FormData()
    form.set("operation", operation)
    form.set("conversationId", "group-1")
    await expect(groupConversationAction({ status: "idle" }, form)).resolves.toMatchObject({
      status: "error",
      error: "sign-in-required"
    })
  }
  expect(command).toHaveBeenCalledTimes(3)
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
