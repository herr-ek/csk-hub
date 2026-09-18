"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { messageCommandErrorState } from "../command-result"
import { sendMessage } from "../direct/send"
import type { MessageCommandState } from "../shared/message-command-state"
import { markConversationRead } from "./read"

export async function sendMessageAction(_state: MessageCommandState, formData: FormData): Promise<MessageCommandState> {
  const conversationId = String(formData.get("conversationId") ?? "")
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "")

  try {
    const result = await sendMessage({
      conversationId,
      text: formData.get("text"),
      idempotencyKey
    })

    revalidatePath(`${ROUTES.messages}/${result.conversationId}`)
    revalidatePath(ROUTES.messages)
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error)
  }
}

export async function markConversationReadAction(conversationId: string, sequence: number, token: string) {
  await markConversationRead(conversationId, sequence, token)
}
