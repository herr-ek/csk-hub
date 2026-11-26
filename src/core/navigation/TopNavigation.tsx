"use client"

import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type RefObject, useLayoutEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/base/tooltip"
import { cn } from "@/shared/utils"
import { DESTINATIONS } from "./destinations"
import type { NavLinkItem } from "./NavLinks"
import { isActiveRoute } from "./navigation-utils"
import { PointerLight, usePointerLight } from "./PointerLight"
import { usePendingIndex } from "./use-pending-index"

/** How far the mark stays inside its link's ends, a little short of the name. */
const MARK_INSET_PX = 24

const spring = { type: "spring", bounce: 0.2, visualDuration: 0.3 } as const

/** The links' widths, as names and icons open and close. */
const resize = "motion-safe:duration-300 motion-safe:ease-out"

/**
 * The header's links from `md` up, with a glowing mark under the current section and a light that follows the
 * mouse. Names from `lg`, unless the header is collapsed; otherwise icons, with the current section named.
 */
export function TopNavigation({ items }: { items: NavLinkItem[] }) {
  const t = useTranslations("Navigation")
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const listRef = useRef<HTMLUListElement>(null)
  const light = usePointerLight()

  const [pendingIndex, choose] = usePendingIndex(pathname)
  const currentIndex = items.findIndex((item) => isActiveRoute(pathname, item.href))
  const markedIndex = pendingIndex ?? currentIndex
  const mark = useItemBox(listRef, markedIndex, items.length)

  return (
    <nav
      aria-label={t("primary")}
      onPointerEnter={(event) => light.follow(event, { jump: true })}
      onPointerMove={(event) => light.follow(event)}
      className={cn(
        "group/bar relative py-1",
        // Swells a little when pressed, like the bar on small screens.
        "motion-safe:transition-[scale] motion-safe:duration-300 motion-safe:active:scale-[1.03]"
      )}
    >
      <PointerLight x={light.x} y={light.y} />
      <div className="relative">
        {mark ? (
          <motion.span
            aria-hidden="true"
            initial={false}
            animate={{
              x: mark.left + MARK_INSET_PX,
              width: mark.width - 2 * MARK_INSET_PX,
              opacity: markedIndex === -1 ? 0 : 1
            }}
            transition={reduceMotion ? { duration: 0 } : spring}
            className="pointer-events-none absolute bottom-0.5 left-0 h-0.5 nav-mark"
          />
        ) : null}
        <ul ref={listRef} className="flex">
          {items.map((item, index) => {
            const current = index === currentIndex
            const Icon = DESTINATIONS[item.id].icon
            return (
              <li key={item.id}>
                <Tooltip disabled={current}>
                  <TooltipTrigger
                    render={
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        onNavigate={() => choose(index)}
                        className={cn(
                          "relative flex h-11 items-center rounded-xl px-4 font-medium text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:transition-colors",
                          index === markedIndex ? "text-(--nav-current)" : "text-foreground/75 hover:text-foreground"
                        )}
                      />
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex w-0 shrink-0 overflow-hidden opacity-0 motion-safe:transition-[width,opacity,margin] compact-nav:w-5 compact-nav:opacity-100",
                        resize,
                        current && "compact-nav:mr-2"
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                    </span>
                    <span
                      className={cn(
                        "grid grid-cols-[1fr] motion-safe:transition-[grid-template-columns,opacity]",
                        resize,
                        !current && "compact-nav:grid-cols-[0fr] compact-nav:opacity-0"
                      )}
                    >
                      <span className="min-w-0 overflow-hidden whitespace-nowrap">{item.label}</span>
                    </span>
                    {/* The unread count beside a name, or a dot on an icon without one. */}
                    <span
                      className={cn(
                        "flex *:data-[slot=badge]:ml-2",
                        !current &&
                          "compact-nav:absolute compact-nav:top-2 compact-nav:right-2 compact-nav:*:data-[slot=badge]:ml-0 compact-nav:*:data-[slot=badge]:size-2.5 compact-nav:*:data-[slot=badge]:p-0 compact-nav:*:data-[slot=badge]:text-transparent"
                      )}
                    >
                      {item.badge}
                    </span>
                  </TooltipTrigger>
                  {/* From `lg` hovering or focusing the link opens its name instead. */}
                  <TooltipContent side="bottom" sideOffset={8} className="lg:hidden">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

/** Where the list's item at `index` sits, kept up to date as the items resize. Keeps the last box while there is none. */
function useItemBox(listRef: RefObject<HTMLUListElement | null>, index: number, count: number) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: the items to observe change with their count.
  useLayoutEffect(() => {
    const list = listRef.current
    const item = list?.children[index]
    if (!list || !(item instanceof HTMLElement)) return
    const measure = () => setBox({ left: item.offsetLeft, width: item.offsetWidth })
    measure()
    // Every item, since one resizing moves those after it.
    const observer = new ResizeObserver(measure)
    for (const child of list.children) observer.observe(child)
    return () => observer.disconnect()
  }, [listRef, index, count])

  return box
}
