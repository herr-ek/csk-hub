"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import type { GroupType } from "../../model"
import { CommandDialog } from "../command-dialog"
import { NAME_MAX_LENGTH } from "../limits"
import { createGroupAction } from "./actions"

/** Choirs and Sections are created only with their Choir, so they are never offered here. */
const CREATABLE_TYPES: GroupType[] = [
  "Board",
  "GigGroup",
  "Gigmästeri",
  "Sexmästeri",
  "Roddgrupp",
  "Festgrupp",
  "Rephelg",
  "Konsertmästeri",
  "Rekryteringskommitté",
  "Turnékommitté",
  "Valberedning",
  "Webmästeri",
  "Föräldramötet",
  "Arkivarie",
  "Utantillkommitté",
  "Övrig"
]

export function CreateGroupDialog({ choirs }: { choirs: { id: string; name: string }[] }) {
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
      <InputField label={t("name")} name="name" required maxLength={NAME_MAX_LENGTH} />
      <SelectField
        label={t("type")}
        name="type"
        required
        options={CREATABLE_TYPES.map((type) => ({ value: type, label: types(type) }))}
      />
      <SelectField
        label={t("choir")}
        name="choirId"
        options={[
          { value: "", label: t("cskWide") },
          ...choirs.map((choir) => ({ value: choir.id, label: choir.name }))
        ]}
      />
    </CommandDialog>
  )
}
