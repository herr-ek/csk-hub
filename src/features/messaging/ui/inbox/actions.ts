"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { startDirectConversation } from "../../sending"
import type { MessageCommandState } from "../composer/message-command-state"
import { messageCommandErrorState } from "../message-command-result"
import { searchMembers } from "./member-search"

export async function startDirectConversationAction(
  _state: MessageCommandState,
  formData: FormData
): Promise<MessageCommandState> {
  const text = String(formData.get("text") ?? "")

  try {
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
