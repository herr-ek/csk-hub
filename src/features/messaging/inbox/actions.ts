"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { messageCommandErrorState } from "../command-result"
import { startDirectConversation } from "../direct/start"
import type { MessageCommandState } from "../shared/message-command-state"
import { searchMembers } from "./member-search"

export async function startDirectConversationAction(
  _state: MessageCommandState,
  formData: FormData
): Promise<MessageCommandState> {
  try {
    const result = await startDirectConversation({
      recipientId: String(formData.get("recipientId") ?? ""),
      text: formData.get("text"),
      idempotencyKey: String(formData.get("idempotencyKey") ?? "")
    })

    revalidatePath(ROUTES.messages)
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error)
  }
}

export async function searchMembersAction(query: string) {
  return searchMembers(query)
}
