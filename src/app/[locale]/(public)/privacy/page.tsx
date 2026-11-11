import type { Metadata } from "next"
import { app } from "@/core/config/app"
import { getTranslations } from "@/core/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.info")
  return { title: t("privacyTitle") }
}

export default async function PrivacyPage() {
  const t = await getTranslations("Public.info")

  return (
    <article className="relative left-1/2 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 space-y-6 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("privacyTitle")}</h1>
        <p>{t("privacyIntro")}</p>
      </header>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("dataTitle")}</h2>
        <p>{t("dataBody")}</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("technicalTitle")}</h2>
        <p>{t("technicalBody")}</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("contactTitle")}</h2>
        <p>{t("privacyContact")}</p>
        <a href={`mailto:${app.contactEmail}`} className="break-all underline underline-offset-4">
          {app.contactEmail}
        </a>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("idTitle")}</h2>
        <p>{t("idBody")}</p>
        <p>{t("appSession")}</p>
      </section>
    </article>
  )
}
