"use client"

import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { CommandDialog } from "../command-dialog"
import { createGroupAction } from "./actions"
import { GroupFields } from "./GroupFields"

export function CreateGroupDialog({
  choirs,
  currentYear
}: {
  currentYear: number
  choirs: { id: string; name: string }[]
}) {
  const t = useTranslations("Groups")
  return (
    <CommandDialog
      trigger={<Button type="button">{t("create")}</Button>}
      title={t("create")}
      description={t("createDescription")}
      action={createGroupAction}
      submitLabel={t("create")}
    >
      <GroupFields choirs={choirs} currentYear={currentYear} />
    </CommandDialog>
  )
}
