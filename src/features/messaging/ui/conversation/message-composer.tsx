"use client"

import { useActionState, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { useMessageScroller } from "@/shared/ui/base/message-scroller"
import { Textarea } from "@/shared/ui/base/textarea"
import { MAX_MESSAGE_BODY_LENGTH } from "../../model/message-body"
import { createMessageIdempotencyKey, nextMessageIdempotencyKey } from "../composer/idempotency-key"
import type { MessageCommandState } from "../composer/message-command-state"
import { submitOnEnter } from "../composer/submit-on-enter"
import { sendMessageAction } from "./actions"

const initialState: MessageCommandState = { status: "idle" }

export function MessageComposer({ conversationId, readOnly }: { conversationId: string; readOnly: boolean }) {
  const t = useTranslations("Messages")
  const { scrollToEnd } = useMessageScroller()

  const [idempotencyKey, setIdempotencyKey] = useState(createMessageIdempotencyKey)
  const [state, action, pending] = useActionState(sendMessageAction, initialState)

  useEffect(() => {
    if (state.status !== "success") return
    setIdempotencyKey((currentKey) => nextMessageIdempotencyKey(currentKey))
    scrollToEnd({ behavior: "smooth" })
  }, [scrollToEnd, state])

  useEffect(() => {
    if (state.status !== "error" || state.error !== "idempotency-key-reused") return
    setIdempotencyKey((currentKey) => nextMessageIdempotencyKey(currentKey))
  }, [state])

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
        defaultValue={state.status === "error" ? state.text : undefined}
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
