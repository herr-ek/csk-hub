"use client"

import { useTranslations } from "@/core/i18n/translations"
import type { IsoDate } from "@/core/org-structure"
import { DateField } from "@/shared/forms/fields"

/**
 * The dates of a change, tucked away behind their defaults. They stay in the form while closed.
 */
export function DatesField({
  start,
  min,
  max,
  withLastDay = true
}: {
  start: IsoDate
  min?: IsoDate
  max?: IsoDate
  withLastDay?: boolean
}) {
  const t = useTranslations("OrgAdmin.dates")
  return (
    <details className="rounded-2xl border px-4 py-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">{t("different")}</summary>
      <div className="mt-4 flex flex-col gap-4">
        <DateField label={t("firstDay")} name="startDate" defaultValue={start} min={min} max={max} required />
        {withLastDay ? (
          <DateField label={t("lastDay")} description={t("lastDayHelp")} name="lastDay" min={min} max={max} />
        ) : null}
      </div>
    </details>
  )
}
