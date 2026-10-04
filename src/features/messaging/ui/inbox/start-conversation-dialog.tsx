"use client"

import { PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/shared/ui/base/dialog"
import { Input } from "@/shared/ui/base/input"
import { Textarea } from "@/shared/ui/base/textarea"
import { MAX_GROUP_NAME_LENGTH } from "../../model/group-conversation"
import { MAX_MESSAGE_BODY_LENGTH } from "../../model/message-body"
import { createMessageIdempotencyKey } from "../composer/idempotency-key"
import type { MessageCommandState } from "../composer/message-command-state"
import { MemberSelection, type SelectedMember } from "../member-selection"
import { startConversationAction } from "./actions"

const initialState: MessageCommandState = { status: "idle" }
export function StartConversationDialog() {
  const t = useTranslations("Messages")
  const common = useTranslations("Common")
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="icon" aria-label={t("startTitle")} title={t("startTitle")} />
        }
      >
        <PlusIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("startTitle")}</DialogTitle>
          <DialogDescription>{t("startCombinedDescription")}</DialogDescription>
        </DialogHeader>
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-4 top-4"
              aria-label={common("close")}
            />
          }
        >
          <XIcon aria-hidden="true" />
        </DialogClose>
        <StartConversationForm />
      </DialogContent>
    </Dialog>
  )
}

function StartConversationForm() {
  const t = useTranslations("Messages")
  const router = useRouter()
  const [selected, setSelected] = useState<SelectedMember[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(createMessageIdempotencyKey)
  const [name, setName] = useState("")
  const [text, setText] = useState("")
  const [state, action, pending] = useActionState(startConversationAction, initialState)
  const isGroup = selected.length > 1
  useEffect(() => {
    if (state.status === "success") router.push(`/messages/${state.conversationId}`)
  }, [state, router])
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <MemberSelection
        value={selected}
        disabled={pending}
        onChange={(members) => {
          setSelected(members)
          setIdempotencyKey(createMessageIdempotencyKey())
        }}
      />
      {selected.length ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t(isGroup ? "groupConversationMode" : "directConversationMode")}
        </p>
      ) : null}
      {isGroup ? (
        <Input
          name="name"
          aria-label={t("groupName")}
          placeholder={t("groupName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={MAX_GROUP_NAME_LENGTH}
          disabled={pending}
        />
      ) : selected.length === 1 ? (
        <Textarea
          name="text"
          aria-label={t("firstMessageLabel")}
          placeholder={t("messagePlaceholder")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
          maxLength={MAX_MESSAGE_BODY_LENGTH}
          disabled={pending}
        />
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {t(state.error === "unexpected" ? "groupUpdateFailed" : `errors.${state.error}`)}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-fit max-w-full whitespace-normal"
        disabled={pending || selected.length === 0 || (isGroup ? !name.trim() : !text.trim())}
      >
        {pending ? t("starting") : t(isGroup ? "createGroup" : "sendMessage")}
      </Button>
    </form>
  )
}
