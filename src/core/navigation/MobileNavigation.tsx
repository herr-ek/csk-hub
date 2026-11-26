"use client"

import { MenuIcon, XIcon } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { app } from "@/core/config/app"
import { useTranslations } from "@/core/i18n/translations"
import { cn } from "@/shared/utils"
import { DESTINATIONS } from "./destinations"
import { MorphMenu, reveal, spring } from "./MorphMenu"
import type { NavLinkItem } from "./NavLinks"
import { isActiveRoute } from "./navigation-utils"

export interface MobileNavigationProps {
  items: NavLinkItem[]
  /** Shown on the menu button, since the links and their badges are hidden until it opens. */
  indicator?: ReactNode
}

/**
 * The signed-in menu on small screens: the menu button morphs into a panel of links, as the account menu does from the
 * avatar. The links blur in one after another, styled like the header's: the current section in its colour with a
 * glowing mark. The theme is in the account menu.
 */
export function MobileNavigation({ items, indicator }: MobileNavigationProps) {
  const t = useTranslations("Navigation")
  const pathname = usePathname()
  return (
    <MorphMenu
      layoutId="navigation-menu"
      buttonLabel={t("openMenu")}
      panelLabel={app.name}
      button={
        <>
          <MenuIcon className="size-5" aria-hidden />
          {indicator}
        </>
      }
      buttonClassName="flex items-center justify-center hover:bg-muted"
      panelClassName="top-0 right-0 w-64"
    >
      {(close) => (
        <>
          <motion.button
            {...reveal}
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => close(true)}
            className="ml-auto flex size-9 cursor-pointer items-center justify-center rounded-full outline-none hover:bg-foreground/10 focus-visible:bg-foreground/10"
          >
            <XIcon className="size-5" aria-hidden />
          </motion.button>
          <nav aria-label={t("primary")}>
            <ul className="flex flex-col gap-0.5">
              {items.map((item, index) => {
                const current = isActiveRoute(pathname, item.href)
                const Icon = DESTINATIONS[item.id].icon
                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, x: 12, filter: "blur(6px)" }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      filter: "blur(0px)",
                      transition: { ...spring, delay: 0.1 + index * 0.04 }
                    }}
                    exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.1 } }}
                  >
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      onClick={() => close()}
                      className={cn(
                        "relative flex h-12 items-center gap-3 rounded-2xl px-4 font-medium text-base outline-none hover:bg-foreground/10 focus-visible:bg-foreground/10 motion-safe:transition-[color,background-color,scale] motion-safe:active:scale-[0.98]",
                        current ? "text-(--nav-current)" : "text-foreground/80"
                      )}
                    >
                      {current ? (
                        <span aria-hidden="true" className="absolute inset-y-3.5 left-0 w-0.5 nav-mark" />
                      ) : null}
                      <Icon className="size-5 shrink-0" aria-hidden />
                      {item.label}
                      <span className="ml-auto flex">{item.badge}</span>
                    </Link>
                  </motion.li>
                )
              })}
            </ul>
          </nav>
        </>
      )}
    </MorphMenu>
  )
}
