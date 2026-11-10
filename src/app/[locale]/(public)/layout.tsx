import type { ReactNode } from "react"
import { LocaleSwitcher } from "@/core/i18n/locale-switcher"
import { ThemeSwitch } from "@/core/theme/ThemeSwitch"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex w-full items-center gap-4 justify-between">
        <ThemeSwitch />
        <LocaleSwitcher />
      </div>
      <div className="mt-6">{children}</div>
    </main>
  )
}
