"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { createGroupConversation } from "../../group-conversations"
import { MessagingAccessError } from "../../model/messaging-error"
import { startDirectConversation } from "../../sending"
import type { MessageCommandState } from "../composer/message-command-state"
import { requireMessageSendingAvailable } from "../message-command-access"
import { messageCommandErrorState } from "../message-command-result"
import { searchMembers } from "./member-search"

export async function startDirectConversationAction(
  _state: MessageCommandState,
  formData: FormData
): Promise<MessageCommandState> {
  const text = String(formData.get("text") ?? "")

  try {
    await requireMessageSendingAvailable()
    const result = await startDirectConversation({
      recipientId: String(formData.get("recipientId") ?? ""),
      text,
      idempotencyKey: String(formData.get("idempotencyKey") ?? "")
    })

    revalidatePath(ROUTES.messages)
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, text)
  }
}

export async function searchMembersAction(query: string) {
  return searchMembers(query)
}

/** The unique member count selects the Conversation kind on the server as well as in the UI. */
export async function startConversationAction(
  _state: MessageCommandState,
  formData: FormData
): Promise<MessageCommandState> {
  const text = String(formData.get("text") ?? "")
  try {
    await requireMessageSendingAvailable()
    const memberIds = [
      ...new Set(
        formData
          .getAll("memberIds")
          .map(String)
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ]
    if (!memberIds.length) throw new MessagingAccessError("recipient-required")
    const result =
      memberIds.length === 1
        ? await startDirectConversation({
            recipientId: memberIds[0],
            text,
            idempotencyKey: String(formData.get("idempotencyKey") ?? "")
          })
        : await createGroupConversation({ name: String(formData.get("name") ?? ""), memberIds })
    revalidatePath("/[locale]/(app)/messages", "page")
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, text)
  }
}
