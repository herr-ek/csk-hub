"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
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

    revalidatePath(`${ROUTES.messages}/${result.conversationId}`)
    revalidatePath(ROUTES.messages)
    return { status: "success", conversationId: result.conversationId }
  } catch (error) {
    return messageCommandErrorState(error, text)
  }
}

export async function markConversationReadAction(conversationId: string, sequence: number, token: string) {
  await markConversationRead(conversationId, sequence, token)
}
