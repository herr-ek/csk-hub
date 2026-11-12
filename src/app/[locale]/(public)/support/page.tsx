import type { Metadata } from "next"
import Link from "next/link"
import { app } from "@/core/config/app"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.info")
  return { title: t("supportTitle") }
}

export default async function SupportPage() {
  const t = await getTranslations("Public.info")

  return (
    <article className="relative left-1/2 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 space-y-6 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("supportTitle")}</h1>
        <p>{t("supportIntro")}</p>
      </header>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("contactTitle")}</h2>
        <a href={`mailto:${app.contactEmail}`} className="break-all underline underline-offset-4">
          {app.contactEmail}
        </a>
        <p>{t("supportDetails")}</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">{t("loginHelpTitle")}</h2>
        <p>{t("loginHelpBody")}</p>
        <Link href={ROUTES.forgotPassword} className="block underline underline-offset-4">
          {t("resetPassword")}
        </Link>
        <Link href={ROUTES.login} className="block underline underline-offset-4">
          {t("signIn")}
        </Link>
      </section>
    </article>
  )
}
