import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { PasswordReset } from "@/features/account/password-reset"
import { Spinner } from "@/shared/ui/base/spinner"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.passwordReset")

  return { title: t("resetPageTitle") }
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PasswordReset />
    </Suspense>
  )
}
