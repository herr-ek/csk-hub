import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card } from "@/shared/ui/base/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/base/collapsible"
import { Skeleton } from "@/shared/ui/base/skeleton"
import {
  ArchiveAbsenceReasonDialog,
  CreateAbsenceReasonDialog,
  RenameAbsenceReasonDialog
} from "./AbsenceReasonDialogs"
import { type AbsenceReasonRow, listAbsenceReasons } from "./query"

/** The preset reasons for declining an Event. Archived ones stay on their Responses but are not offered. */
export async function AbsenceReasonsScreen() {
  const [reasons, t] = await Promise.all([listAbsenceReasons(), getTranslations("Events.absenceReasons")])
  const active = reasons.filter((reason) => reason.active)
  const archived = reasons.filter((reason) => !reason.active)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminAbsenceReasons" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <CreateAbsenceReasonDialog />
        </div>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ReasonList reasons={active} />
      )}

      <Collapsible>
        <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          {t("showArchived", { count: archived.length })}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneArchived")}</p>
          ) : (
            <ReasonList reasons={archived} />
          )}
        </CollapsibleContent>
      </Collapsible>
    </main>
  )
}

async function ReasonList({ reasons }: { reasons: AbsenceReasonRow[] }) {
  const t = await getTranslations("Events.absenceReasons")
  return (
    <Card className="gap-0 divide-y py-0">
      {reasons.map((reason) => (
        <div key={reason.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">{reason.label}</span>
              {reason.active ? null : <Badge variant="secondary">{t("archivedBadge")}</Badge>}
            </div>
            <span className="text-sm text-muted-foreground">{t("responseCount", { count: reason.responseCount })}</span>
          </div>
          {reason.active ? (
            <div className="flex gap-1">
              <RenameAbsenceReasonDialog reason={reason} />
              <ArchiveAbsenceReasonDialog reason={reason} />
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  )
}

export async function AbsenceReasonsScreenSkeleton() {
  const t = await getTranslations("Events.absenceReasons")
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route="adminAbsenceReasons" />
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </main>
  )
}
