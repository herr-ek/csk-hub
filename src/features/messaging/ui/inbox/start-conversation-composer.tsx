"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Textarea } from "@/shared/ui/base/textarea"
import { MAX_MESSAGE_BODY_LENGTH } from "../../model/message-body"
import { createMessageIdempotencyKey } from "../composer/idempotency-key"
import type { MessageCommandState } from "../composer/message-command-state"
import { submitOnEnter } from "../composer/submit-on-enter"
import { startDirectConversationAction } from "./actions"

const initialState: MessageCommandState = { status: "idle" }

export function StartConversationComposer({ recipientId }: { recipientId: string }) {
  const t = useTranslations("Messages")
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
        aria-label={t("firstMessageLabel")}
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
        {pending ? t("starting") : t("sendMessage")}
      </Button>
    </form>
  )
}
