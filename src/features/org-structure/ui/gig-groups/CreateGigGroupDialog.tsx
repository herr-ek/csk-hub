"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { GroupCommandDialog } from "../group-command-dialog"
import { NAME_MAX_LENGTH } from "../limits"
import { createGigGroupAction } from "./actions"

export function CreateGigGroupDialog() {
  const t = useTranslations("OrgAdmin.gigGroups")
  const groups = useTranslations("Groups")
  return (
    <GroupCommandDialog
      trigger={<Button type="button">{t("create")}</Button>}
      title={t("create")}
      action={createGigGroupAction}
      submitLabel={groups("create")}
    >
      <InputField label={groups("name")} name="name" maxLength={NAME_MAX_LENGTH} required />
    </GroupCommandDialog>
  )
}
