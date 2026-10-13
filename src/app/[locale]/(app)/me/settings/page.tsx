import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { AccountSettings, AccountSettingsSkeleton } from "@/features/account/settings"

export default async function SettingsPage() {
  const t = await getTranslations("AccountSettings")
  const profile = await getTranslations("MemberProfiles")
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href={ROUTES.account}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {profile("backToProfile")}
      </Link>
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
