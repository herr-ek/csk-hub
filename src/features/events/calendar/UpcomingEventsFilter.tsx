"use client"

import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "@/core/i18n/translations"
import { SelectField } from "@/shared/forms/fields"
import type { EventType } from "../model"

/** The type filter lives in the address, so a filtered list can be linked and reloaded. */
export function UpcomingEventsFilter({ type, types }: { type: EventType | undefined; types: EventType[] }) {
  const t = useTranslations("Events.calendar")
  const typeLabels = useTranslations("Events.types")
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="sm:max-w-xs">
      <SelectField
        label={t("filterLabel")}
        name="type"
        value={type ?? ""}
        onValueChange={(next) => router.replace(next ? `${pathname}?type=${next}` : pathname)}
        options={[{ value: "", label: t("anyType") }, ...types.map((value) => ({ value, label: typeLabels(value) }))]}
      />
    </div>
  )
}
