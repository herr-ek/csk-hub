"use client"

import { useId, useState } from "react"

import { useTranslations } from "@/core/i18n/translations"
import { GROUP_POLICIES, GroupType, groupTypeKey, hasExplicitGroupName } from "@/core/org-structure"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { CommandDialog } from "../command-dialog"
import { NAME_MAX_LENGTH } from "../limits"
import { createGroupAction } from "./actions"

/** Choirs and Sections are created only with their Choir, so they are never offered here. */
const CREATABLE_TYPES = Object.values(GroupType).filter(
  (type) => type !== GroupType.Choir && type !== GroupType.Section
)

export function CreateGroupDialog({ choirs }: { choirs: { id: string; name: string }[] }) {
  const id = useId()
  const [type, setType] = useState<GroupType>(GroupType.GigGroup)
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")

  return (
    <CommandDialog
      trigger={<Button type="button">{t("create")}</Button>}
      title={t("create")}
      description={t("createDescription")}
      action={createGroupAction}
      submitLabel={t("create")}
    >
      {hasExplicitGroupName(type) ? (
        <InputField label={t("name")} name="name" required maxLength={NAME_MAX_LENGTH} />
      ) : null}
      <Field>
        <FieldLabel htmlFor={id}>{t("type")}</FieldLabel>
        <Select
          name="type"
          value={type}
          onValueChange={(value) => {
            if (value) setType(value as GroupType)
          }}
          items={CREATABLE_TYPES.map((type) => ({ value: type, label: types(groupTypeKey(type)) }))}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CREATABLE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {types(groupTypeKey(type))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {GROUP_POLICIES[type].lifetime === "annual" ? (
        <InputField label={t("management.year")} name="organisationYear" type="number" required min={1000} max={9998} />
      ) : null}
      {GROUP_POLICIES[type].scope === "choir" ? (
        <SelectField
          label={t("choir")}
          name="choirId"
          required
          options={choirs.map((choir) => ({ value: choir.id, label: choir.name }))}
        />
      ) : null}
    </CommandDialog>
  )
}
