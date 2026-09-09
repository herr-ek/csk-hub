"use client"

import { useEffect } from "react"
import { markConversationReadAction } from "./actions"

export function ReadMarker({
  conversationId,
  sequence,
  token
}: {
  conversationId: string
  sequence: number
  token?: string
}) {
  useEffect(() => {
    if (token) void markConversationReadAction(conversationId, sequence, token)
  }, [conversationId, sequence, token])
  return null
}
