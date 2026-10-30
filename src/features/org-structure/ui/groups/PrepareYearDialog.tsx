"use client"

import { useTranslations } from "@/core/i18n/translations"
import { SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { CommandDialog } from "../command-dialog"
import { prepareYearAction } from "./actions"

export function PrepareYearDialog({ currentYear }: { currentYear: number }) {
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
      <SelectField
        label={t("year")}
        name="organisationYear"
        defaultValue={String(currentYear + 1)}
        options={[currentYear, currentYear + 1].map((year) => ({
          value: String(year),
          label: t("yearValue", { start: year, end: year + 1 })
        }))}
        required
      />
    </CommandDialog>
  )
}
