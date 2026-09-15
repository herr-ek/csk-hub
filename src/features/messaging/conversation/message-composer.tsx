"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { useMessageScroller } from "@/shared/ui/base/message-scroller"
import { Textarea } from "@/shared/ui/base/textarea"
import { type MessageCommandState, sendMessageAction } from "../actions"
import { MAX_MESSAGE_BODY_LENGTH } from "../shared/message-body"
import { createMessageIdempotencyKey, nextMessageIdempotencyKey } from "../shared/message-idempotency"
import { submitOnEnter } from "../shared/submit-on-enter"

const initialState: MessageCommandState = { status: "idle" }

export function MessageComposer({ conversationId, readOnly }: { conversationId: string; readOnly: boolean }) {
  const t = useTranslations("Messages")
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
  if (readOnly) return <p className="text-sm text-muted-foreground">{t("readOnly")}</p>

  return (
    <form action={action} className="grid gap-3">
      <input name="conversationId" type="hidden" value={conversationId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <Textarea
        name="text"
        aria-label={t("messageLabel")}
        placeholder={t("messagePlaceholder")}
        required
        maxLength={MAX_MESSAGE_BODY_LENGTH}
        onKeyDown={(event) => submitOnEnter(event, pending)}
      />
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("sending") : t("sendMessage")}
      </Button>
    </form>
  )
}
