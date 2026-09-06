import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { TwoFactorForm } from "@/features/account/two-factor"
import { Spinner } from "@/shared/ui/base/spinner"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Public.twoFactor" })

  return { title: t("pageTitle") }
}

export default async function TwoFactorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Public.twoFactor" })

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-normal">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </header>
      <Suspense fallback={<Spinner />}>
        <TwoFactorForm />
      </Suspense>
    </>
  )
}
