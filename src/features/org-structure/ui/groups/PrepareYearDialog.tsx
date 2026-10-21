"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { CommandDialog } from "../command-dialog"
import { prepareYearAction } from "./actions"

export function PrepareYearDialog() {
  const t = useTranslations("Groups.management")
  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="outline">
          {t("prepare")}
        </Button>
      }
      title={t("prepare")}
      description={t("prepareDescription")}
      action={prepareYearAction}
      submitLabel={t("prepare")}
    >
      <InputField
        label={t("year")}
        description={t("yearHelp")}
        name="organisationYear"
        type="number"
        min={1000}
        max={9998}
        required
      />
    </CommandDialog>
  )
}
