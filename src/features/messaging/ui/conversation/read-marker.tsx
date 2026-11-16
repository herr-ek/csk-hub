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
    const mark = () => {
      if (token && document.visibilityState === "visible")
        void markConversationReadAction(conversationId, sequence, token).catch(() => {})
    }
    mark()
    document.addEventListener("visibilitychange", mark)
    return () => document.removeEventListener("visibilitychange", mark)
  }, [conversationId, sequence, token])
  return null
}
