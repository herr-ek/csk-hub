"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "@/core/i18n/translations"
import { SelectField } from "@/shared/forms/fields"
import { buttonVariants } from "@/shared/ui/base/button"
import { EVENT_STATUSES, EVENT_TYPES } from "../../model"
import type { EventListFilters } from "./query"

/** The list's filters live in the address, so a filtered list can be linked and reloaded. */
export function eventListSearch(filters: EventListFilters) {
  const params = new URLSearchParams()
  if (filters.when === "past") params.set("when", "past")
  if (filters.status) params.set("status", filters.status)
  if (filters.type) params.set("type", filters.type)
  const search = params.toString()
  return search ? `?${search}` : ""
}

export function EventFilters({ filters }: { filters: EventListFilters }) {
  const t = useTranslations("Events.list")
  const types = useTranslations("Events.types")
  const statuses = useTranslations("Events.statuses")
  const router = useRouter()
  const pathname = usePathname()

  const apply = (next: Partial<EventListFilters>) => {
    router.replace(`${pathname}${eventListSearch({ ...filters, ...next })}`)
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <nav aria-label={t("when")} className="flex gap-1">
        {(["upcoming", "past"] as const).map((when) => (
          <Link
            key={when}
            href={`${pathname}${eventListSearch({ ...filters, when })}`}
            aria-current={filters.when === when ? "page" : undefined}
            className={buttonVariants({ variant: filters.when === when ? "secondary" : "ghost", size: "sm" })}
          >
            {t(when)}
          </Link>
        ))}
      </nav>
      <div className="grid flex-1 gap-4 sm:max-w-md sm:grid-cols-2">
        <SelectField
          label={t("status")}
          name="status"
          value={filters.status ?? ""}
          onValueChange={(status) => apply({ status: (status || undefined) as EventListFilters["status"] })}
          options={[
            { value: "", label: t("anyStatus") },
            ...EVENT_STATUSES.map((status) => ({ value: status, label: statuses(status) }))
          ]}
        />
        <SelectField
          label={t("type")}
          name="type"
          value={filters.type ?? ""}
          onValueChange={(type) => apply({ type: (type || undefined) as EventListFilters["type"] })}
          options={[
            { value: "", label: t("anyType") },
            ...EVENT_TYPES.map((type) => ({ value: type, label: types(type) }))
          ]}
        />
      </div>
    </div>
  )
}
