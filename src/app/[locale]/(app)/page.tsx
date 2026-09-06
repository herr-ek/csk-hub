import { getTranslations } from "@/core/i18n/server"

export const instant = false

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "HomePage" })

  return (
    <div className="mx-auto my-auto">
      <h1>{t("title")}</h1>
    </div>
  )
}
