"use client"

import { useRouter } from "next/navigation"
import { type KeyboardEvent, useActionState, useEffect, useState } from "react"
import { Button } from "@/shared/ui/base/button"
import { useMessageScroller } from "@/shared/ui/base/message-scroller"
import { Textarea } from "@/shared/ui/base/textarea"
import { type MessageCommandState, sendMessageAction, startDirectConversationAction } from "./actions"
import { createMessageIdempotencyKey, nextMessageIdempotencyKey } from "./message-idempotency"

const initialState: MessageCommandState = { status: "idle" }

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, pending: boolean) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
  event.preventDefault()
  if (!pending) event.currentTarget.form?.requestSubmit()
}

export function StartConversationComposer({ recipientId }: { recipientId: string }) {
  const router = useRouter()
  const [idempotencyKey] = useState(createMessageIdempotencyKey)
  const [state, action, pending] = useActionState(startDirectConversationAction, initialState)
  useEffect(() => {
    if (state.status === "success") router.push(`/messages/${state.conversationId}`)
  }, [router, state])

  return (
    <form action={action} className="grid gap-3">
      <input name="recipientId" type="hidden" value={recipientId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <Textarea
        name="text"
        aria-label="First message"
        placeholder="Write a message…"
        required
        maxLength={4000}
        onKeyDown={(event) => submitOnEnter(event, pending)}
      />
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Send message"}
      </Button>
    </form>
  )
}

export function MessageComposer({ conversationId, readOnly }: { conversationId: string; readOnly: boolean }) {
  const router = useRouter()
  const { scrollToEnd } = useMessageScroller()
  const [idempotencyKey, setIdempotencyKey] = useState(createMessageIdempotencyKey)
  const [state, action, pending] = useActionState(sendMessageAction, initialState)
  useEffect(() => {
    if (state.status !== "success") return
    setIdempotencyKey((currentKey) => nextMessageIdempotencyKey(currentKey))
    scrollToEnd({ behavior: "smooth" })
    router.refresh()
  }, [router, scrollToEnd, state])
  if (readOnly) return <p className="text-sm text-muted-foreground">This Conversation is read-only.</p>

  return (
    <form action={action} className="grid gap-3">
      <input name="conversationId" type="hidden" value={conversationId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <Textarea
        name="text"
        aria-label="Message"
        placeholder="Write a message…"
        required
        maxLength={4000}
        onKeyDown={(event) => submitOnEnter(event, pending)}
      />
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  )
}
