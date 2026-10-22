import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { timeZone } from "@/core/i18n/time-zone"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { currentOrganisationYear, GroupType, groupTypeKey, POSITION_DEFINITIONS } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { AppointmentManagement } from "./AppointmentManagement"
import { DirectMembersSection } from "./DirectMembersSection"
import { EffectiveMembersSection } from "./EffectiveMembersSection"
import { FluidAppointmentManagement } from "./FluidAppointmentManagement"
import { GroupHeaderActions } from "./group-header-actions"
import { getGroupDetail } from "./query"

/** Today in CSK's time zone, as the default date for new Memberships and holdings. */
function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())
}

export async function GroupDetailScreen({ groupId }: { groupId: string }) {
  const date = today()
  const [detail, t, types] = await Promise.all([
    getGroupDetail(groupId, date),
    getTranslations("Groups"),
    getTranslations("Groups.types")
  ])
  if (!detail) notFound()
  const { group } = detail
  const isChoirOrSection = group.type === GroupType.Choir || group.type === GroupType.Section
  const fluidAppointmentContext =
    group.type === GroupType.Choir || group.type === GroupType.Section || group.type === GroupType.GigGroup

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        {/* Choirs and Sections are listed on the Choirs page, every other group on the groups page. */}
        <PageBreadcrumb
          route={
            isChoirOrSection
              ? "adminOrgStructure"
              : group.type === GroupType.GigGroup
                ? "adminGigGroups"
                : "adminOrgStructureGroups"
          }
          current={group.name}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-semibold">
              {group.name}
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
          <GroupHeaderActions currentYear={currentOrganisationYear(date)} group={group} choirs={detail.choirs} />
        </div>
        {group.active ? null : <p className="text-sm text-muted-foreground">{t("detail.archivedNotice")}</p>}
      </div>

      <DirectMembersSection detail={detail} today={date} />
      <EffectiveMembersSection detail={detail} />
      {Object.values(POSITION_DEFINITIONS).some(({ context }) => context === group.type) ? (
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

export async function GroupDetailScreenSkeleton() {
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
