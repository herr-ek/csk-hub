import type { Metadata } from "next"
import { getTranslations } from "@/core/i18n/server"
import { ActivationFailed } from "@/features/account/activation"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.activationFailed")

  return { title: t("pageTitle") }
}

export default function ActivationFailedPage() {
  return <ActivationFailed />
}
