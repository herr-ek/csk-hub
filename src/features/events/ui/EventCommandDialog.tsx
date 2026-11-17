"use client"

import { useTranslations } from "@/core/i18n/translations"
import { CommandDialog, type CommandDialogProps } from "@/shared/forms/CommandDialog"
import type { EventCommandError } from "./command-state"
import { useEventErrorMessage } from "./errors"

type EventCommandDialogProps = Omit<
  CommandDialogProps<EventCommandError>,
  "pendingLabel" | "cancelLabel" | "errorMessage"
>

/** A dialog holding one admin Events command, in the Events admin's copy. */
export function EventCommandDialog(props: EventCommandDialogProps) {
  const t = useTranslations("Events")
  const common = useTranslations("Common")
  const errorMessage = useEventErrorMessage()

  return (
    <CommandDialog {...props} pendingLabel={t("working")} cancelLabel={common("cancel")} errorMessage={errorMessage} />
  )
}
