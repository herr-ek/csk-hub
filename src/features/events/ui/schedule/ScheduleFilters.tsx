"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "@/core/i18n/translations"
import { SelectField } from "@/shared/forms/fields"
import { buttonVariants } from "@/shared/ui/base/button"
import type { ScheduleFilters as Filters } from "./query"

/** The list's filters live in the address, so a filtered schedule can be linked and reloaded. */
function scheduleSearch(filters: Filters) {
  const params = new URLSearchParams()
  if (filters.when === "past") params.set("when", "past")
  if (filters.choirGroupId) params.set("choir", filters.choirGroupId)
  const search = params.toString()
  return search ? `?${search}` : ""
}

export function ScheduleFilters({ filters, choirs }: { filters: Filters; choirs: { id: string; name: string }[] }) {
  const t = useTranslations("Events.schedule.list")
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <nav aria-label={t("when")} className="flex gap-1">
        {(["upcoming", "past"] as const).map((when) => (
          <Link
            key={when}
            href={`${pathname}${scheduleSearch({ ...filters, when })}`}
            aria-current={filters.when === when ? "page" : undefined}
            className={buttonVariants({ variant: filters.when === when ? "secondary" : "ghost", size: "sm" })}
          >
            {t(when)}
          </Link>
        ))}
      </nav>
      <div className="flex-1 sm:max-w-xs">
        <SelectField
          label={t("choir")}
          name="choir"
          value={filters.choirGroupId ?? ""}
          onValueChange={(choir) =>
            router.replace(`${pathname}${scheduleSearch({ ...filters, choirGroupId: choir || undefined })}`)
          }
          options={[
            { value: "", label: t("allChoirs") },
            ...choirs.map(({ id, name }) => ({ value: id, label: name }))
          ]}
        />
      </div>
    </div>
  )
}
