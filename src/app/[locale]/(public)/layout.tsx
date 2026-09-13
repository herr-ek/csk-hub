import type { ReactNode } from "react"
import { LocaleSwitcher } from "@/core/i18n/locale-switcher"
import { CenteredPage } from "@/shared/layouts/centered-page"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <CenteredPage>
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>
      {children}
    </CenteredPage>
  )
}
