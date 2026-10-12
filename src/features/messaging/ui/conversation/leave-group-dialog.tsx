"use client"

import { useActionState, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/shared/ui/base/alert-dialog"
import { Button } from "@/shared/ui/base/button"
import type { MessageCommandState } from "../composer/message-command-state"
import { groupConversationAction } from "./group-actions"

const initialState: MessageCommandState = { status: "idle" }
export function LeaveGroupDialog({ conversationId }: { conversationId: string }) {
  const t = useTranslations("Messages")
  const common = useTranslations("Common")
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(groupConversationAction, initialState)
  useEffect(() => {
    if (state.status === "success") setOpen(false)
  }, [state])
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      <AlertDialogTrigger render={<Button type="button" variant="destructive" className="w-fit max-w-full" />}>
        {t("leaveGroup")}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmLeaveGroup")}</AlertDialogTitle>
          <AlertDialogDescription>{t("leaveGroupDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="operation" value="leave" />
          <input type="hidden" name="conversationId" value={conversationId} />
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {t(state.error === "unexpected" ? "groupUpdateFailed" : `errors.${state.error}`)}
            </p>
          ) : null}
          <AlertDialogFooter className="flex-row flex-wrap justify-end">
            <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending} className="w-fit max-w-full">
              {pending ? t("savingGroup") : t("leaveGroup")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
