"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"
import { buttonVariants } from "@/shared/ui/base/button"
import { cn } from "@/shared/utils"
import type { DestinationId } from "./destinations"
import { isActiveRoute } from "./navigation-utils"

export type NavLinkItem = { id: DestinationId; href: string; label: string; badge?: React.ReactNode }

export interface NavLinksProps {
  items: NavLinkItem[]
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

function NavLinkList({ items, pathname }: NavLinksProps & { pathname: string | null }) {
  return (
    <ul className="flex items-center gap-1.5">
      {items.map((item) => {
        const active = pathname !== null && isActiveRoute(pathname, item.href)
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-xl px-5 py-4",
                active && "bg-muted text-foreground"
              )}
            >
              {item.label}
              {item.badge}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
