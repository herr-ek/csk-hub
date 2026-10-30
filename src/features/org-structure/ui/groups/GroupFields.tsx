"use client"

import { useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { GROUP_POLICIES, GroupType, groupTypeKey, hasExplicitGroupName } from "@/core/org-structure"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { NAME_MAX_LENGTH } from "../limits"

type EditableGroup = { name: string; type: GroupType; choirId?: string | null; organisationYear?: number | null }

/** Fixed type policies decide which scope and year controls are meaningful. */
export function GroupFields({
  choirs,
  initial,
  currentYear
}: {
  currentYear: number
  choirs: { id: string; name: string }[]
  initial?: EditableGroup
}) {
  const t = useTranslations("Groups")
  const [type, setType] = useState<GroupType>(initial?.type ?? GroupType.Other)
  const id = useId()
  const options = (Object.keys(GROUP_POLICIES) as GroupType[])
    .filter((type) => type !== GroupType.Choir && type !== GroupType.Section && type !== GroupType.GigGroup)
    .map((type) => ({ value: type, label: t(`types.${groupTypeKey(type)}`) }))
  const policy = GROUP_POLICIES[type]
  return (
    <>
      {hasExplicitGroupName(type) ? (
        <InputField
          key={type}
          label={t("name")}
          name="name"
          defaultValue={initial && hasExplicitGroupName(initial.type) ? initial.name : undefined}
          required
          maxLength={NAME_MAX_LENGTH}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("management.derivedName")}</p>
      )}
      <Field>
        <FieldLabel htmlFor={id}>{t("type")}</FieldLabel>
        <Select
          name="type"
          value={type}
          onValueChange={(value) => {
            if (value) setType(value as GroupType)
          }}
          items={options}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {policy.scope === "choir" ? (
        <SelectField
          label={t("choir")}
          name="choirId"
          required
          defaultValue={initial?.choirId ?? undefined}
          options={choirs.map((choir) => ({ value: choir.id, label: choir.name }))}
        />
      ) : null}
      {policy.lifetime === "annual" ? (
        <InputField
          label={t("management.year")}
          description={t("management.yearHelp")}
          name="organisationYear"
          type="number"
          min={1000}
          max={currentYear + 1}
          required
          defaultValue={initial?.organisationYear ?? undefined}
        />
      ) : null}
    </>
  )
}
