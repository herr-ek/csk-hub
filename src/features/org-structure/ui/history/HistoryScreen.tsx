import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { cskToday, GroupType } from "@/core/org-structure"
import { Badge } from "@/shared/ui/base/badge"
import { buttonVariants } from "@/shared/ui/base/button"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cn } from "@/shared/utils"
import { committeePath, gigGroupPath } from "../command-state"
import { PeopleProvider } from "../PeopleContext"
import { HistoryTabs } from "./HistoryTabs"
import { type GroupHistory, getGroupHistory } from "./query"

/** The page that manages a Group: its place in the menu, and the address that shows it. */
function managedOn({ id, type, organisationYear }: GroupHistory["group"]) {
  switch (type) {
    case GroupType.Choir:
    case GroupType.Section:
      return { route: "adminChoirs", href: ROUTES.adminChoirs } as const
    case GroupType.Board:
      return { route: "adminBoard", href: `${ROUTES.adminBoard}?year=${organisationYear}` } as const
    case GroupType.GigGroup:
      return { route: "adminGigGroups", href: gigGroupPath(id) } as const
    case GroupType.ParentsMeeting:
      return { route: "adminChoirPositions", href: ROUTES.adminChoirPositions } as const
    default:
      return {
        route: "adminCommittees",
        href: committeePath(type === GroupType.Other ? id : type, organisationYear ?? undefined)
      } as const
  }
}

/** A Group's past, current and planned participation, for correcting what is recorded. */
export async function GroupHistoryScreen({ groupId }: { groupId: string }) {
  const today = cskToday()
  const [history, t, groups, routes] = await Promise.all([
    getGroupHistory(groupId, today),
    getTranslations("OrgAdmin.history"),
    getTranslations("Groups"),
    getTranslations("Navigation.routes")
  ])
  if (!history) notFound()
  const { group, people, sectionVoice } = history
  const { route, href } = managedOn(group)
  return (
    <PeopleProvider people={people} today={today}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageBreadcrumb route={route} current={t("titleFor", { name: group.name })} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-semibold">
              {t("titleFor", { name: group.name })}
              {sectionVoice ? <Badge variant="outline">{sectionVoice}</Badge> : null}
              {group.active ? null : <Badge variant="secondary">{groups("archived")}</Badge>}
            </h1>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {t(group.active ? "description" : "archivedDescription")}
            </p>
          </div>
          <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {t("manage", { page: routes(route) })}
          </Link>
        </div>
        <HistoryTabs history={history} />
      </main>
    </PeopleProvider>
  )
}

export async function GroupHistoryScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.history")
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </main>
  )
}
