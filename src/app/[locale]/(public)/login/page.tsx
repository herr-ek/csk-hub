import type { Metadata } from "next"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { LoginForm } from "@/features/account/login"
import { Spinner } from "@/shared/ui/base/spinner"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Public.login")

  return { title: t("pageTitle") }
}

export default async function LoginPage() {
  const t = await getTranslations("Public.login")

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-normal">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </header>
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </>
  )
}
