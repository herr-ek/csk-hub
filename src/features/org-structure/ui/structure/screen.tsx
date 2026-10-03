import { getTranslations } from "@/core/i18n/server"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PositionCatalogue } from "../catalogue/position-catalogue"
import { listPositionCatalogue } from "../catalogue/query"
import { CreateGroupDialog } from "./create-group-dialog"
import { StructureOverview } from "./overview"
import { getGroupStructure } from "./query"

export async function GroupsScreen() {
  const [structure, positions, t] = await Promise.all([
    getGroupStructure(),
    listPositionCatalogue(),
    getTranslations("Groups")
  ])
  const choirs = structure.choirs
    .filter(({ choir }) => choir.active)
    .map(({ choir }) => ({ id: choir.id, name: choir.name }))

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <CreateGroupDialog choirs={choirs} />
      </div>

      <StructureOverview structure={structure} />
      <PositionCatalogue positions={positions} />
    </main>
  )
}

export async function GroupsScreenSkeleton() {
  const t = await getTranslations("Groups")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
