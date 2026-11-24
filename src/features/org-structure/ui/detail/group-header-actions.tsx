"use client"

import { useTranslations } from "@/core/i18n/translations"
import { GROUP_POLICIES, GroupType, hasExplicitGroupName } from "@/core/org-structure"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { GroupCommandDialog } from "../group-command-dialog"
import { archiveGroupAction, editGroupAction, renameGroupAction } from "../groups/actions"
import { GroupFields } from "../groups/GroupFields"
import { NAME_MAX_LENGTH } from "../limits"
import type { GroupDetail } from "./query"

export function GroupHeaderActions({
  group,
  choirs,
  currentYear
}: {
  currentYear: number
  group: GroupDetail["group"]
  choirs: { id: string; name: string }[]
}) {
  const t = useTranslations("Groups")
  // Choirs and Sections are reference data, archived only together and not from here.
  const editable = group.type !== GroupType.Choir && group.type !== GroupType.Section
  const archivable = editable && GROUP_POLICIES[group.type].lifetime !== "annual"

  return (
    <div className="flex flex-wrap gap-2">
      {editable && group.type !== GroupType.GigGroup ? (
        <GroupCommandDialog
          trigger={
            <Button type="button" variant="outline">
              {t("management.edit")}
            </Button>
          }
          title={t("management.edit")}
          action={editGroupAction}
          submitLabel={t("management.save")}
        >
          <input type="hidden" name="groupId" value={group.id} />
          <GroupFields currentYear={currentYear} choirs={choirs} initial={{ ...group, choirId: group.choir?.id }} />
        </GroupCommandDialog>
      ) : null}
      {hasExplicitGroupName(group.type) ? (
        <GroupCommandDialog
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
          <InputField label={t("name")} name="name" defaultValue={group.name} required maxLength={NAME_MAX_LENGTH} />
        </GroupCommandDialog>
      ) : null}
      {archivable && group.active ? (
        <GroupCommandDialog
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
        </GroupCommandDialog>
      ) : null}
    </div>
  )
}
