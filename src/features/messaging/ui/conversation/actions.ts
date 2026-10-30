"use server"

import { revalidatePath } from "next/cache"
import { getRequestSession } from "@/core/auth/session.server"
import { scheduleActivityDispatch } from "@/features/activity/server"
import { sendMessage } from "../../sending"
import type { MessageCommandState } from "../composer/message-command-state"
import { requireMessageSendingAvailable } from "../message-command-access"
import { messageCommandErrorState } from "../message-command-result"
import { markConversationRead } from "./read"

export async function sendMessageAction(_state: MessageCommandState, formData: FormData): Promise<MessageCommandState> {
  const conversationId = String(formData.get("conversationId") ?? "")
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "")
  const text = String(formData.get("text") ?? "")

  try {
    await requireMessageSendingAvailable()
    const result = await sendMessage({
      conversationId,
      text,
      idempotencyKey
    })

    revalidatePath("/[locale]/(app)/messages/[conversationId]", "page")
    revalidatePath("/[locale]/(app)/messages", "page")
    scheduleActivityDispatch()
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, text)
  }
}

export async function markConversationReadAction(conversationId: string, sequence: number, token: string) {
  const session = await getRequestSession()
  if (!session || session.session.impersonatedBy) return
  await markConversationRead(conversationId, sequence, token)
  scheduleActivityDispatch()
}
