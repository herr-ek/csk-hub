"use server"

import { revalidatePath } from "next/cache"
import { scheduleActivityDispatch } from "@/features/activity/server"
import { createGroupConversation } from "../../group-conversations"
import { groupMemberIds } from "../../model/group-conversation"
import { startDirectConversation } from "../../sending"
import type { MessageCommandState } from "../composer/message-command-state"
import { requireMessageSendingAvailable } from "../message-command-access"
import { messageCommandErrorState } from "../message-command-result"
import { searchMembers } from "./member-search"

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
    const memberIds = groupMemberIds(formData.getAll("memberIds").map(String))
    const result =
      memberIds.length === 1
        ? await startDirectConversation({
            recipientId: memberIds[0],
            text,
            idempotencyKey: String(formData.get("idempotencyKey") ?? "")
          })
        : await createGroupConversation({
            name: String(formData.get("name") ?? ""),
            memberIds,
            idempotencyKey: String(formData.get("idempotencyKey") ?? "")
          })
    revalidatePath("/[locale]/(app)/messages", "page")
    scheduleActivityDispatch()
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, text)
  }
}
