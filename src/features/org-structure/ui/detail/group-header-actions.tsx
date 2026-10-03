"use client"

import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { CommandDialog } from "../command-dialog"
import { TextField } from "../form-fields"
import { archiveGroupAction, renameGroupAction } from "../structure/actions"
import type { GroupDetail } from "./query"

export function GroupHeaderActions({ group }: { group: GroupDetail["group"] }) {
  const t = useTranslations("Groups")
  // Choirs and Sections are reference data, archived only together and not from here.
  const archivable = group.type !== "Choir" && group.type !== "Section"

  return (
    <div className="flex flex-wrap gap-2">
      <CommandDialog
        trigger={
          <Button type="button" variant="outline">
            {t("rename")}
          </Button>
        }
        title={t("renameTitle", { name: group.name })}
        action={renameGroupAction}
        submitLabel={t("rename")}
      >
        <input type="hidden" name="groupId" value={group.id} />
        <TextField label={t("name")} name="name" defaultValue={group.name} />
      </CommandDialog>
      {archivable ? (
        <CommandDialog
          trigger={
            <Button type="button" variant="destructive">
              {t("archive")}
            </Button>
          }
          title={t("archiveTitle", { name: group.name })}
          description={t("archiveDescription")}
          action={archiveGroupAction}
          submitLabel={t("archive")}
          destructive
        >
          <input type="hidden" name="groupId" value={group.id} />
        </CommandDialog>
      ) : null}
    </div>
  )
}
