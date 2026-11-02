"use server"

import { refresh, revalidatePath } from "next/cache"
import { getRequestSession } from "@/core/auth/session.server"
import { scheduleActivityDispatch } from "@/features/messaging/activity"
import { sendMessage } from "../../sending"
import type { MessageCommandState } from "../composer/message-command-state"
import { messageCommandErrorState } from "../message-command-result"
import { markConversationRead } from "./read"

export async function sendMessageAction(_state: MessageCommandState, formData: FormData): Promise<MessageCommandState> {
  const conversationId = String(formData.get("conversationId") ?? "")
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "")
  const text = String(formData.get("text") ?? "")

  try {
    const result = await sendMessage({
      conversationId,
      text,
      idempotencyKey
    })

    revalidatePath("/[locale]/(app)/messages/[conversationId]", "page")
    revalidatePath("/[locale]/(app)/messages", "page")
    if (result.created) scheduleActivityDispatch()
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, text)
  }
}

export async function markConversationReadAction(conversationId: string, sequence: number, token: string) {
  const session = await getRequestSession()
  if (!session || session.session.impersonatedBy) return
  const moved = await markConversationRead(conversationId, sequence, token)
  if (!moved) return
  scheduleActivityDispatch()

  // The navigation's unread badge lives in the layout, which only a refresh re-renders; the
  // inbox the User came from is cached by the router and would still show this one unread.
  revalidatePath("/[locale]/(app)/messages", "page")
  refresh()
}
