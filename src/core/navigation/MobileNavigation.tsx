"use client"

import { MenuIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { app } from "@/core/config/app"
import { useTranslations } from "@/core/i18n/translations"
import { ThemeSwitch } from "@/core/theme/ThemeSwitch"
import { Button } from "@/shared/ui/base/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/shared/ui/base/sheet"
import { LogoutButton } from "./logout-button"
import { type NavLinkItem, NavLinks } from "./NavLinks"

export interface MobileNavigationProps {
  items: NavLinkItem[]
  isImpersonating: boolean
}

/** The signed-in menu on small screens: a menu button that opens the nav links, theme and logout in a side sheet. */
export function MobileNavigation({ items, isImpersonating }: MobileNavigationProps) {
  const t = useTranslations("Navigation")
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label={t("openMenu")} />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between gap-2 px-4 py-3">
          <SheetTitle>{app.name}</SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon" aria-label={t("closeMenu")} />}>
            <XIcon />
          </SheetClose>
        </SheetHeader>
        <nav aria-label={t("primary")} className="px-3">
          <NavLinks items={items} orientation="vertical" onNavigate={() => setOpen(false)} />
        </nav>
        <SheetFooter className="flex-row items-center justify-between gap-2 border-t p-4">
          <LogoutButton isImpersonating={isImpersonating} />
          <ThemeSwitch />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
