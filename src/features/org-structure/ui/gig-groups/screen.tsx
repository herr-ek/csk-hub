import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { GroupType } from "@/core/org-structure"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { listGroupSummaries } from "../group-summaries"
import { GigGroupsOverview } from "./overview"

export async function GigGroupsScreen() {
  const [groups, t] = await Promise.all([listGroupSummaries(), getTranslations("Groups.gigGroupsPage")])
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumb route="adminGigGroups" />
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <GigGroupsOverview groups={groups.filter((group) => group.type === GroupType.GigGroup)} />
    </main>
  )
}

export async function GigGroupsScreenSkeleton() {
  const t = await getTranslations("Groups.gigGroupsPage")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminGigGroups" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <Skeleton className="h-48 rounded-xl" />
    </main>
  )
}
