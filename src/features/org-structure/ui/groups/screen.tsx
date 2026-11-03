import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { currentOrganisationYear } from "@/core/org-structure"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { cskToday } from "../../effective-reads"
import { CreateGroupDialog } from "./create-group-dialog"
import { GroupsOverview } from "./overview"
import { PrepareYearDialog } from "./PrepareYearDialog"
import { getGroupsOverview } from "./query"

/** The groups beside the Choirs' Sections, with their complete member rosters. */
export async function GroupsScreen() {
  const [overview, t] = await Promise.all([getGroupsOverview(), getTranslations("Groups")])
  const currentYear = currentOrganisationYear(cskToday())
  const choirs = overview.choirs
    .filter(({ choir }) => choir.active)
    .map(({ choir }) => ({ id: choir.id, name: choir.name }))

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumb route="adminOrgStructureGroups" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("groupsPage.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("groupsPage.description")}</p>
          <Link
            href={ROUTES.adminOrgStructure}
            className="mt-2 inline-block text-sm text-muted-foreground underline underline-offset-4"
          >
            {t("groupsPage.choirsLink")}
          </Link>
          <Link
            href={ROUTES.adminGigGroups}
            className="mt-2 ml-4 inline-block text-sm text-muted-foreground underline underline-offset-4"
          >
            {t("groupsPage.gigGroupsLink")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrepareYearDialog currentYear={currentYear} />
          <CreateGroupDialog choirs={choirs} currentYear={currentYear} />
        </div>
      </div>

      <GroupsOverview overview={overview} />
    </main>
  )
}

export async function GroupsScreenSkeleton() {
  const t = await getTranslations("Groups")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminOrgStructureGroups" />
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("groupsPage.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("groupsPage.description")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
