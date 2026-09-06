import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"

export const instant = false

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "HomePage" })

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">Everything the choir publishes now has a home here.</p>
      <Link href={ROUTES.news} className={buttonVariants()}>
        Read the news
      </Link>
    </main>
  )
}
