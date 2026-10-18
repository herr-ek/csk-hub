"use client"

import { useTranslations } from "@/core/i18n/translations"
import { CommandDialog, type CommandDialogProps } from "@/shared/forms/CommandDialog"
import type { GroupCommandError } from "./command-state"

type GroupCommandDialogProps = Omit<
  CommandDialogProps<GroupCommandError>,
  "pendingLabel" | "cancelLabel" | "successMessage" | "errorMessage"
>

/** A dialog holding one admin groups command, in the groups admin's copy. */
export function GroupCommandDialog(props: GroupCommandDialogProps) {
  const t = useTranslations("Groups")
  const common = useTranslations("Common")
  const errorMessage = useCommandErrorMessage()

  return (
    <CommandDialog
      {...props}
      pendingLabel={t("saving")}
      cancelLabel={common("cancel")}
      successMessage={t("saved")}
      errorMessage={errorMessage}
    />
  )
}

/** A translated message for every way an admin groups command can fail. */
export function useCommandErrorMessage() {
  const t = useTranslations("Groups.errors")
  return (error: GroupCommandError) => t(error)
}
