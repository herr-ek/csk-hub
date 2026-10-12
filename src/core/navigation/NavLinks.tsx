"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"
import { buttonVariants } from "@/shared/ui/base/button"
import { cn } from "@/shared/utils"
import { isActiveRoute } from "./navigation-utils"

export type NavLinkItem = { id: string; href: string; label: string }

export interface NavLinksProps {
  items: NavLinkItem[]
  orientation?: "horizontal" | "vertical"
  onNavigate?: () => void
}

/** The primary nav links, with the current section marked. Renders unmarked links until the pathname is known. */
export function NavLinks(props: NavLinksProps) {
  return (
    <Suspense fallback={<NavLinkList {...props} pathname={null} />}>
      <CurrentNavLinks {...props} />
    </Suspense>
  )
}

function CurrentNavLinks(props: NavLinksProps) {
  const pathname = usePathname()
  return <NavLinkList {...props} pathname={pathname} />
}

function NavLinkList({
  items,
  orientation = "horizontal",
  onNavigate,
  pathname
}: NavLinksProps & { pathname: string | null }) {
  const vertical = orientation === "vertical"
  return (
    <ul className={cn("flex gap-1.5", vertical ? "flex-col" : "items-center")}>
      {items.map((item) => {
        const active = pathname !== null && isActiveRoute(pathname, item.href)
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                buttonVariants({ variant: "ghost", size: vertical ? "default" : "sm" }),
                vertical && "w-full justify-start text-base",
                active && "bg-muted text-foreground"
              )}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
