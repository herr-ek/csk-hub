import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { ActivationForm } from "@/features/account/activation"
import { Spinner } from "@/shared/ui/base/spinner"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Public.activation" })

  return { title: t("pageTitle") }
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ActivationForm />
    </Suspense>
  )
}
