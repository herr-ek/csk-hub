import type { Metadata } from "next"
import { getTranslations } from "@/core/i18n/server"
import { PasswordResetRequest } from "@/features/account/password-reset"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.passwordReset")

  return { title: t("requestPageTitle") }
}

export default function ForgotPasswordPage() {
  return <PasswordResetRequest />
}
