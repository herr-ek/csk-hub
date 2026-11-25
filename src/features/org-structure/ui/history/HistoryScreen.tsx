import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { cskToday, GroupType, groupTypeKey, POSITION_DEFINITIONS } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { AppointmentManagement } from "./AppointmentManagement"
import { FluidAppointmentManagement } from "./FluidAppointmentManagement"
import { MembersSection } from "./MembersSection"
import { getGroupDetail } from "./query"

export async function GroupHistoryScreen({ groupId }: { groupId: string }) {
  const date = cskToday()
  const [detail, t, types, history] = await Promise.all([
    getGroupDetail(groupId, date),
    getTranslations("Groups"),
    getTranslations("Groups.types"),
    getTranslations("OrgAdmin.history")
  ])
  if (!detail) notFound()
  const { group } = detail
  const route =
    group.type === GroupType.Choir || group.type === GroupType.Section
      ? "adminChoirs"
      : group.type === GroupType.Board
        ? "adminBoard"
        : group.type === GroupType.GigGroup
          ? "adminGigGroups"
          : group.type === GroupType.ParentsMeeting
            ? "adminChoirPositions"
            : "adminCommittees"
  const fluidAppointmentContext =
    group.type === GroupType.Choir || group.type === GroupType.Section || group.type === GroupType.GigGroup

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb route={route} current={history("titleFor", { name: group.name })} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-semibold">
              {history("titleFor", { name: group.name })}
              {group.active ? null : <Badge variant="secondary">{t("archived")}</Badge>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.choir
                ? t("detail.typeInChoir", { type: types(groupTypeKey(group.type)), choir: group.choir.name })
                : t("detail.typeCskWide", { type: types(groupTypeKey(group.type)) })}
            </p>
            {group.organisationYear !== null ? (
              <Badge variant="outline">
                {t("management.yearValue", { start: group.organisationYear, end: group.organisationYear + 1 })}
              </Badge>
            ) : null}
            {detail.sectionVoice ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="outline">{detail.sectionVoice}</Badge>
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{history("description")}</p>
        {group.active ? null : <p className="text-sm text-muted-foreground">{t("detail.archivedNotice")}</p>}
      </div>

      <MembersSection detail={detail} today={date} />
      {Object.values(POSITION_DEFINITIONS).some(
        ({ context, endPolicy }) => context === group.type && endPolicy === "annual"
      ) ? (
        <AppointmentManagement detail={detail} today={date} />
      ) : null}
      {fluidAppointmentContext &&
      (Object.values(POSITION_DEFINITIONS).some(
        ({ context, endPolicy }) => context === group.type && endPolicy === "fluid"
      ) ||
        detail.appointments.some(({ organisationYear }) => organisationYear === null)) ? (
        <FluidAppointmentManagement detail={detail} today={date} />
      ) : null}
    </main>
  )
}

export async function GroupHistoryScreenSkeleton() {
  const t = await getTranslations("Groups")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <span className="sr-only">{t("detail.loading")}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </main>
  )
}
