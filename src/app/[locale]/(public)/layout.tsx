import type { ReactNode } from "react"
import { LocaleSwitcher } from "@/core/i18n/locale-switcher"
import { ThemeSwitch } from "@/core/theme/ThemeSwitch"
import { CenteredPage } from "@/shared/layouts/centered-page"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <CenteredPage>
      <div className="flex w-full items-center gap-4 justify-between">
        <ThemeSwitch />
        <LocaleSwitcher />
      </div>
      {children}
    </CenteredPage>
  )
}
