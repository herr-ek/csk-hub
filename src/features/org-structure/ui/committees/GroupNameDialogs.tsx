"use client"

import type { ReactElement } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { GroupCommandDialog } from "../group-command-dialog"
import { NAME_MAX_LENGTH } from "../limits"
import { archiveGroupAction, createOtherGroupAction, renameGroupAction } from "./actions"

export function CreateOtherGroupDialog({ trigger }: { trigger: ReactElement }) {
  const t = useTranslations("OrgAdmin.committees")
  const groups = useTranslations("Groups")
  return (
    <GroupCommandDialog
      trigger={trigger}
      title={t("create")}
      description={t("createDescription")}
      action={createOtherGroupAction}
      submitLabel={groups("create")}
    >
      <InputField label={groups("name")} name="name" maxLength={NAME_MAX_LENGTH} required />
    </GroupCommandDialog>
  )
}

/** Renames or archives a Group that has a name of its own. */
export function GroupNameActions({ groupId, name }: { groupId: string; name: string }) {
  const t = useTranslations("Groups")
  return (
    <>
      <GroupCommandDialog
        trigger={
          <Button type="button" variant="ghost" size="sm">
            {t("rename")}
          </Button>
        }
        title={t("renameTitle", { name })}
        action={renameGroupAction}
        submitLabel={t("rename")}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <InputField label={t("name")} name="name" defaultValue={name} required maxLength={NAME_MAX_LENGTH} />
      </GroupCommandDialog>
      <GroupCommandDialog
        trigger={
          <Button type="button" variant="ghost" size="sm">
            {t("archive")}
          </Button>
        }
        title={t("archiveTitle", { name })}
        description={t("archiveDescription")}
        action={archiveGroupAction}
        submitLabel={t("archive")}
        destructive
      >
        <input type="hidden" name="groupId" value={groupId} />
      </GroupCommandDialog>
    </>
  )
}
