"use server"

import { revalidatePath } from "next/cache"
import {
  addGroupMembers,
  createGroupConversation,
  leaveGroupConversation,
  renameGroupConversation
} from "../../group-conversations"
import { MessagingAccessError } from "../../model/messaging-error"
import type { MessageCommandState } from "../composer/message-command-state"
import { requireMessageSendingAvailable } from "../message-command-access"
import { messageCommandErrorState } from "../message-command-result"

export async function groupConversationAction(
  _state: MessageCommandState,
  formData: FormData
): Promise<MessageCommandState> {
  const name = String(formData.get("name") ?? "")
  const conversationId = String(formData.get("conversationId") ?? "")
  const memberIds = formData.getAll("memberIds").map(String)
  try {
    await requireMessageSendingAvailable()
    const operation = formData.get("operation")
    let result: { conversationId: string }
    switch (operation) {
      case "create":
        result = await createGroupConversation({ name, memberIds })
        break
      case "add":
        result = await addGroupMembers({ conversationId, memberIds })
        break
      case "rename":
        result = await renameGroupConversation({ conversationId, name })
        break
      case "leave":
        result = await leaveGroupConversation(conversationId)
        break
      default:
        throw new MessagingAccessError("conversation-unavailable")
    }
    revalidatePath("/[locale]/(app)/messages", "page")
    revalidatePath("/[locale]/(app)/messages/[conversationId]", "page")
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, name)
  }
}
