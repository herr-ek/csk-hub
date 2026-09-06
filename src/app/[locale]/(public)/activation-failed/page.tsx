import type { Metadata } from "next"
import { getTranslations } from "@/core/i18n/server"
import { ActivationFailed } from "@/features/account/activation"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Public.activationFailed" })

  return { title: t("pageTitle") }
}

export default function ActivationFailedPage() {
  return <ActivationFailed />
}
