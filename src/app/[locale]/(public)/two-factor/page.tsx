import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { TwoFactorForm } from "@/features/account/two-factor"
import { Spinner } from "@/shared/ui/base/spinner"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.twoFactor")

  return { title: t("pageTitle") }
}

export default async function TwoFactorPage() {
  const t = await getTranslations("Public.twoFactor")

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
