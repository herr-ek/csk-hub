import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { AccountSettings, AccountSettingsSkeleton } from "@/features/account/settings"

export const instant = false

export default async function Me({ params }: PageProps<"/[locale]/me">) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "AccountSettings" })
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageDescription")}</p>
      </div>
      <Suspense fallback={<AccountSettingsSkeleton />}>
        <AccountSettings />
      </Suspense>
    </main>
  )
}
