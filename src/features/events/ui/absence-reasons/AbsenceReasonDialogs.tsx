"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { EventCommandDialog } from "../EventCommandDialog"
import { SHORT_TEXT_MAX_LENGTH } from "../limits"
import { archiveAbsenceReasonAction, createAbsenceReasonAction, renameAbsenceReasonAction } from "./actions"
import type { AbsenceReasonRow } from "./query"

function LabelField({ reason }: { reason?: AbsenceReasonRow }) {
  const t = useTranslations("Events.absenceReasons")
  return (
    <InputField
      label={t("label")}
      name="label"
      defaultValue={reason?.label}
      maxLength={SHORT_TEXT_MAX_LENGTH}
      required
    />
  )
}

export function CreateAbsenceReasonDialog() {
  const t = useTranslations("Events.absenceReasons")
  return (
    <EventCommandDialog
      trigger={<Button type="button">{t("create")}</Button>}
      title={t("create")}
      action={createAbsenceReasonAction}
      submitLabel={t("create")}
      successMessage={t("saved")}
    >
      <LabelField />
    </EventCommandDialog>
  )
}

export function RenameAbsenceReasonDialog({ reason }: { reason: AbsenceReasonRow }) {
  const t = useTranslations("Events.absenceReasons")
  return (
    <EventCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("rename")}
        </Button>
      }
      title={t("renameTitle", { label: reason.label })}
      description={reason.responseCount > 0 ? t("renameAffectsResponses", { count: reason.responseCount }) : undefined}
      action={renameAbsenceReasonAction}
      submitLabel={t("save")}
      successMessage={t("saved")}
    >
      <input type="hidden" name="reasonId" value={reason.id} />
      <LabelField reason={reason} />
    </EventCommandDialog>
  )
}

export function ArchiveAbsenceReasonDialog({ reason }: { reason: AbsenceReasonRow }) {
  const t = useTranslations("Events.absenceReasons")
  return (
    <EventCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("archive")}
        </Button>
      }
      title={t("archiveTitle", { label: reason.label })}
      description={t("archiveExplanation")}
      action={archiveAbsenceReasonAction}
      submitLabel={t("archive")}
      successMessage={t("archived")}
      destructive
    >
      <input type="hidden" name="reasonId" value={reason.id} />
    </EventCommandDialog>
  )
}
