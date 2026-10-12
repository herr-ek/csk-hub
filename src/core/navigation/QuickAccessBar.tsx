"use client"

import { MenuIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { cn } from "@/shared/utils"
import { MobileNavigation } from "./MobileNavigation"
import type { NavLinkItem } from "./NavLinks"
import { isActiveRoute } from "./navigation-utils"
import { ROUTE_ICONS } from "./route-icons"
import type { MenuRouteId } from "./site"

export type QuickAccessShortcut = { id: MenuRouteId; href: string; label: string }

export interface QuickAccessBarProps {
  shortcuts: QuickAccessShortcut[]
  /** The menu sheet's links, opened from the bar's last slot. */
  items: NavLinkItem[]
  isImpersonating: boolean
}

/** Liquid Glass material: translucent tint, heavy blur and saturation, a light rim, top highlight and soft shadow. */
const glass =
  "relative border border-white/40 bg-background/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_8px_32px_rgb(0_0_0/0.18)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-background/30 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_32px_rgb(0_0_0/0.5)]"

/** A faint top-down sheen, as if light catches the upper edge of the glass. */
const sheen =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-linear-to-b before:from-white/35 before:to-transparent before:to-60% dark:before:from-white/8"

/** How far the bar reaches up from the bottom edge; toasts read it to stay clear of the bar. */
const BAR_OFFSET = "calc(4.5rem + env(safe-area-inset-bottom))"

/**
 * The member's quick-access shortcuts in a floating glass pill on small screens, with the menu in the last slot.
 * It shrinks to icons while the page scrolls down and expands again on the way up.
 * Renders nothing when the member has no shortcuts.
 */
export function QuickAccessBar(props: QuickAccessBarProps) {
  if (props.shortcuts.length === 0) return null
  return (
    <Suspense fallback={<Bar {...props} pathname={null} />}>
      <CurrentBar {...props} />
    </Suspense>
  )
}

function CurrentBar(props: QuickAccessBarProps) {
  return <Bar {...props} pathname={usePathname()} />
}

function Bar({ shortcuts, items, isImpersonating, pathname }: QuickAccessBarProps & { pathname: string | null }) {
  const t = useTranslations("Navigation")
  const compact = useMinimizeOnScroll(pathname)
  useBottomBarOffset()

  return (
    <>
      {/* Keeps the end of the page, such as the message composer, clear of the fixed bar. */}
      <div aria-hidden="true" className="h-[calc(6rem+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden">
        <nav
          aria-label={t("quickAccess")}
          className={cn(glass, sheen, "pointer-events-auto flex items-center gap-1 rounded-full p-1.5")}
        >
          {shortcuts.map((shortcut) => {
            const Icon = ROUTE_ICONS[shortcut.id]
            const active = pathname !== null && isActiveRoute(pathname, shortcut.href)
            return (
              <Link
                key={shortcut.id}
                href={shortcut.href}
                aria-current={active ? "page" : undefined}
                aria-label={compact ? shortcut.label : undefined}
                className={slotClass(active, compact)}
              >
                <Icon className="size-5" aria-hidden="true" />
                <SlotLabel hidden={compact}>{shortcut.label}</SlotLabel>
              </Link>
            )
          })}
          <MobileNavigation
            items={items}
            isImpersonating={isImpersonating}
            trigger={{
              render: (
                <button
                  type="button"
                  aria-label={compact ? t("openMenu") : undefined}
                  className={slotClass(false, compact)}
                />
              ),
              children: (
                <>
                  <MenuIcon className="size-5" aria-hidden="true" />
                  <SlotLabel hidden={compact}>{t("menu")}</SlotLabel>
                </>
              )
            }}
          />
        </nav>
      </div>
    </>
  )
}

function slotClass(active: boolean, compact: boolean) {
  return cn(
    "relative flex flex-col items-center justify-center rounded-full font-medium text-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-all motion-safe:duration-300",
    compact ? "size-11 gap-0" : "min-w-16 gap-0.5 px-3 py-1.5",
    active && "bg-foreground/10 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] dark:bg-white/15"
  )
}

function SlotLabel({ children, hidden }: { children: string; hidden: boolean }) {
  return (
    <span
      aria-hidden={hidden || undefined}
      className={cn(
        "max-w-20 overflow-hidden text-[11px] leading-tight text-ellipsis whitespace-nowrap motion-safe:transition-all motion-safe:duration-300",
        hidden ? "max-h-0 opacity-0" : "max-h-4 opacity-100"
      )}
    >
      {children}
    </span>
  )
}

/** Compact while the page scrolls down past the top; expanded on the way up and after navigating. */
function useMinimizeOnScroll(pathname: string | null) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    // Scroll events from inner panes are captured too, each tracked against its own last position.
    const lastPositions = new WeakMap<object, number>()
    const onScroll = (event: Event) => {
      const source = event.target instanceof Element ? event.target : window
      const y = source instanceof Element ? source.scrollTop : window.scrollY
      const lastY = lastPositions.get(source) ?? 0
      lastPositions.set(source, y)
      if (y !== lastY) setCompact(y > 48 && y > lastY)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: expanding is a response to navigation itself.
  useEffect(() => setCompact(false), [pathname])

  return compact
}

/** Publishes the bar's height so fixed-position UI near the bottom edge, such as toasts, can sit above it. */
function useBottomBarOffset() {
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--bottom-bar-offset", BAR_OFFSET)
    return () => {
      root.style.removeProperty("--bottom-bar-offset")
    }
  }, [])
}
