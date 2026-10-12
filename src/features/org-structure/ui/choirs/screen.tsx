import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { ChoirsOverview } from "./overview"
import { getChoirPlacement } from "./query"

/** The Choirs and their Sections: where singers are placed in a Choir and given a Voice. */
export async function ChoirsScreen() {
  const [placement, t] = await Promise.all([getChoirPlacement(), getTranslations("Groups")])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumb route="adminOrgStructure" />
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("choirsPage.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("choirsPage.description")}</p>
        <Link
          href={ROUTES.adminOrgStructureGroups}
          className="mt-2 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          {t("choirsPage.groupsLink")}
        </Link>
      </div>

      <ChoirsOverview placement={placement} />
    </main>
  )
}

export async function ChoirsScreenSkeleton() {
  const t = await getTranslations("Groups")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminOrgStructure" />
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("choirsPage.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("choirsPage.description")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
