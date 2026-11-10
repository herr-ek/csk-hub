import Link from "next/link"
import type { ReactNode } from "react"
import { LocaleSwitcher } from "@/core/i18n/locale-switcher"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { ThemeSwitch } from "@/core/theme/ThemeSwitch"
import { CenteredPage } from "@/shared/layouts/centered-page"

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Public.info")

  return (
    <CenteredPage>
      <div className="flex w-full items-center gap-4 justify-between">
        <ThemeSwitch />
        <LocaleSwitcher />
      </div>
      {children}
      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
        <Link href={ROUTES.privacy} className="underline underline-offset-4">
          {t("privacyTitle")}
        </Link>
        <Link href={ROUTES.support} className="underline underline-offset-4">
          {t("supportTitle")}
        </Link>
      </footer>
    </CenteredPage>
  )
}
