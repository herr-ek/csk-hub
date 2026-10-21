import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { timeZone } from "@/core/i18n/time-zone"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Badge } from "@/shared/ui/base/badge"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { POSITION_DEFINITIONS } from "../../model"
import { AppointmentManagement } from "./AppointmentManagement"
import { DirectMembersSection } from "./DirectMembersSection"
import { GroupHeaderActions } from "./group-header-actions"
import { MembersSection } from "./members-section"
import { PositionsSection } from "./positions-section"
import { getGroupDetail } from "./query"

/** Today in CSK's time zone, as the default date for new Memberships and holdings. */
function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())
}

export async function GroupDetailScreen({ groupId }: { groupId: string }) {
  const [detail, t, types] = await Promise.all([
    getGroupDetail(groupId),
    getTranslations("Groups"),
    getTranslations("Groups.types")
  ])
  if (!detail) notFound()
  const { group } = detail
  const isChoirOrSection = group.type === "Choir" || group.type === "Section"
  const date = today()

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        {/* Choirs and Sections are listed on the Choirs page, every other group on the groups page. */}
        <PageBreadcrumb
          route={isChoirOrSection ? "adminOrgStructure" : "adminOrgStructureGroups"}
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
                ? t("detail.typeInChoir", { type: types(group.type), choir: group.choir.name })
                : t("detail.typeCskWide", { type: types(group.type) })}
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
          {group.active ? <GroupHeaderActions group={group} choirs={detail.choirs} /> : null}
        </div>
        {group.active ? null : <p className="text-sm text-muted-foreground">{t("detail.archivedNotice")}</p>}
      </div>

      <DirectMembersSection detail={detail} today={date} />
      {!group.usesAppointmentModel ? <MembersSection detail={detail} today={date} /> : null}
      {!group.usesAppointmentModel ? <PositionsSection detail={detail} today={date} /> : null}
      {group.usesAppointmentModel &&
      group.organisationYear !== null &&
      Object.values(POSITION_DEFINITIONS).some(({ context }) => context === group.type) ? (
        <AppointmentManagement detail={detail} today={date} />
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
