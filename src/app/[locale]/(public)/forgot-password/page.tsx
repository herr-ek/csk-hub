import type { Metadata } from "next"
import { getTranslations } from "@/core/i18n/server"
import { PasswordResetRequest } from "@/features/account/password-reset"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "Public.passwordReset" })

  return { title: t("requestPageTitle") }
}

export default function ForgotPasswordPage() {
  return <PasswordResetRequest />
}
