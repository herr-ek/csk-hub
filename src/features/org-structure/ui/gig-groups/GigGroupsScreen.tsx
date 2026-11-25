import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { gigGroupPath } from "../command-state"
import { loadGigGroups } from "../queries"
import { CreateGigGroupDialog } from "./CreateGigGroupDialog"
import { Balance } from "./LineUp"

/** The gig groups and the balance of each; archived ones are kept below. */
export async function GigGroupsScreen() {
  const [groups, t] = await Promise.all([loadGigGroups(), getTranslations("OrgAdmin.gigGroups")])
  const archived = groups.filter(({ active }) => !active)
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumb route="adminGigGroups" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <CreateGigGroupDialog />
      </div>
      {archived.length === groups.length ? <p className="text-muted-foreground">{t("none")}</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups
          .filter(({ active }) => active)
          .map((group) => (
            <li key={group.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    <Link href={gigGroupPath(group.id)} className="underline-offset-4 hover:underline">
                      {group.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">{t("singers", { count: group.voices.length })}</p>
                  <Balance voices={group.voices} />
                </CardContent>
              </Card>
            </li>
          ))}
      </ul>
      {archived.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t("archived", { count: archived.length })}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {archived.map((group) => (
              <li key={group.id}>
                <Link href={gigGroupPath(group.id)} className="underline-offset-4 hover:underline">
                  {group.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  )
}

export async function GigGroupsScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.gigGroups")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminGigGroups" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <Skeleton className="h-48 rounded-4xl" />
    </main>
  )
}
