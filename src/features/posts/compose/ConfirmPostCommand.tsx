"use client"

import { useActionState, useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/shared/ui/base/alert-dialog"
import { Button } from "@/shared/ui/base/button"
import type { PostCommand, PostCommandState } from "./actions"

const COPY = {
  unpublish: {
    label: "unpublish",
    pending: "unpublishing",
    title: "unpublishTitle",
    description: "unpublishDescription"
  },
  discard: { label: "discardDraft", pending: "discarding", title: "discardTitle", description: "discardDescription" }
} as const

/**
 * A button that asks before changing a Post's state for good — recalling a published Post,
 * throwing a draft away. The action sends the Admin to the feed once it is done.
 */
export function ConfirmPostCommand({
  command,
  action
}: {
  command: PostCommand
  action: (state: PostCommandState) => Promise<PostCommandState>
}) {
  const t = useTranslations("Posts")
  const common = useTranslations("Common")
  const copy = COPY[command]
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState<PostCommandState>(action, { status: "idle" })

  // The form sits outside the dialog so it adds no gap to the dialog's layout; the
  // confirm button reaches it through its `form` attribute.
  return (
    <>
      <form id={formId} action={submit} />
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
          {t(copy.label)}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(copy.title)}</AlertDialogTitle>
            <AlertDialogDescription>{t(copy.description)}</AlertDialogDescription>
          </AlertDialogHeader>
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {t(state.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
            <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
              {pending ? t(copy.pending) : t(copy.label)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
