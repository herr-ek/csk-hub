"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { MessagingAccessError, type MessagingErrorKind } from "./access"
import { markConversationRead } from "./conversation/read"
import { sendMessage } from "./conversation/send-message"
import { startDirectConversation } from "./inbox/start-direct-conversation"

export type MessageCommandState =
  | { status: "idle" }
  | { status: "error"; error: MessagingErrorKind | "unexpected" }
  | { status: "success"; conversationId: string }

function errorState(error: unknown): MessageCommandState {
  return {
    status: "error",
    error: error instanceof MessagingAccessError ? error.kind : "unexpected"
  }
}

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
    return errorState(error)
  }
}

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
    return errorState(error)
  }
}

export async function markConversationReadAction(conversationId: string, sequence: number, token: string) {
  await markConversationRead(conversationId, sequence, token)
}
