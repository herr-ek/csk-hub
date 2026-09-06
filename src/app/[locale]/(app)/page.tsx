import { getTranslations } from "@/core/i18n/server"

export default async function Home() {
  const t = await getTranslations("HomePage")

  return (
    <div className="mx-auto my-auto">
      <h1>{t("title")}</h1>
    </div>
  )
}
