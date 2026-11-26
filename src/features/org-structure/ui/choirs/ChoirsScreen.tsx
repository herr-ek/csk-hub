import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { loadChoirs } from "../queries"
import { ChoirsBoard } from "./ChoirsBoard"

/** Where singers are placed in a Choir and given a Voice, across all three Choirs. */
export async function ChoirsScreen() {
  const [data, t] = await Promise.all([loadChoirs(), getTranslations("OrgAdmin.choirs")])
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumb route="adminChoirs" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <ChoirsBoard {...data} />
    </main>
  )
}

export async function ChoirsScreenSkeleton() {
  const t = await getTranslations("OrgAdmin.choirs")
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <PageBreadcrumb route="adminChoirs" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-96 rounded-4xl" />
        ))}
      </div>
    </main>
  )
}
