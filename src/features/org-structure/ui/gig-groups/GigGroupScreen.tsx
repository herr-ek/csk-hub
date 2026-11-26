import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { tenureStatus } from "../../roster"
import { GroupNameActions } from "../committees/GroupNameDialogs"
import { HistoryLink } from "../HistoryLink"
import { PeopleProvider } from "../PeopleContext"
import { SlotRow } from "../positions/SlotRow"
import { loadGigGroup } from "../queries"
import { LineUp } from "./LineUp"

/** One gig group: its Gigledare and its line-up by Voice. */
export async function GigGroupScreen({ groupId }: { groupId: string }) {
  const [data, t] = await Promise.all([loadGigGroup(groupId), getTranslations("Groups")])
  if (!data) notFound()
  const { gigGroup, people, today } = data
  const current = gigGroup.members.filter((member) => tenureStatus(member, today) === "current")
  return (
    <PeopleProvider people={people} today={today}>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageBreadcrumb route="adminGigGroups" current={gigGroup.name} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-semibold">
            {gigGroup.name}
            {gigGroup.active ? null : <Badge variant="secondary">{t("archived")}</Badge>}
          </h1>
          <div className="flex flex-wrap gap-2">
            {gigGroup.active ? <GroupNameActions groupId={gigGroup.id} name={gigGroup.name} /> : null}
            <HistoryLink groupId={gigGroup.id} />
          </div>
        </div>
        {gigGroup.active ? (
          <Card size="sm" className="max-w-md">
            <CardContent>
              <SlotRow slot={gigGroup.leader} only={current.map(({ userId }) => userId)} />
            </CardContent>
          </Card>
        ) : null}
        <LineUp gigGroup={gigGroup} />
      </main>
    </PeopleProvider>
  )
}

export async function GigGroupScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.gigGroups")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminGigGroups" />
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-80 rounded-4xl" />
    </main>
  )
}
