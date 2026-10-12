"use client"

import { MenuIcon, SlidersHorizontalIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { type ReactElement, type ReactNode, useState } from "react"
import { app } from "@/core/config/app"
import { useTranslations } from "@/core/i18n/translations"
import { ThemeSwitch } from "@/core/theme/ThemeSwitch"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/shared/ui/base/sheet"
import { cn } from "@/shared/utils"
import { LogoutButton } from "./logout-button"
import { type NavLinkItem, NavLinks } from "./NavLinks"
import { ROUTES } from "./site"

export interface MobileNavigationProps {
  items: NavLinkItem[]
  isImpersonating: boolean
  /** Replaces the default header menu button, e.g. with the quick-access bar's Menu slot. */
  trigger?: { render: ReactElement; children: ReactNode }
}

/** The signed-in menu on small screens: a menu button that opens the nav links, theme and logout in a side sheet. */
export function MobileNavigation({ items, isImpersonating, trigger }: MobileNavigationProps) {
  const t = useTranslations("Navigation")
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger?.render ?? <Button variant="ghost" size="icon" aria-label={t("openMenu")} />}>
        {trigger?.children ?? <MenuIcon />}
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
        <div className="mt-auto px-3 pb-2">
          <Link
            href={ROUTES.accountSettings}
            onClick={() => setOpen(false)}
            className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start text-muted-foreground")}
          >
            <SlidersHorizontalIcon data-icon="inline-start" />
            {t("customizeQuickAccess")}
          </Link>
        </div>
        <SheetFooter className="mt-0 flex-row items-center justify-between gap-2 border-t p-4">
          <LogoutButton isImpersonating={isImpersonating} />
          <ThemeSwitch />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
