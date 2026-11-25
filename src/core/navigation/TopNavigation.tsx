"use client"

import { type MotionValue, motion, useMotionTemplate, useReducedMotion, useSpring } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type PointerEvent, type RefObject, useLayoutEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/base/tooltip"
import { cn } from "@/shared/utils"
import { DESTINATIONS } from "./destinations"
import type { NavLinkItem } from "./NavLinks"
import { isActiveRoute } from "./navigation-utils"

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
  const lightX = useSpring(0, { stiffness: 350, damping: 35 })
  const lightY = useSpring(0, { stiffness: 350, damping: 35 })

  // The link just followed, held while its page loads so the mark does not fall back to the old one in the meantime.
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null)
  if (pending && pending.from !== pathname) setPending(null)

  const currentIndex = items.findIndex((item) => isActiveRoute(pathname, item.href))
  const markedIndex = pending?.index ?? currentIndex
  const mark = useItemBox(listRef, markedIndex, items.length)

  /** The light trails the mouse, but starts where it enters rather than where it last left. */
  function moveLight(event: PointerEvent<HTMLElement>, { jump = false } = {}) {
    const box = event.currentTarget.getBoundingClientRect()
    const move = jump || reduceMotion ? "jump" : "set"
    lightX[move](event.clientX - box.left)
    lightY[move](event.clientY - box.top)
  }

  return (
    <nav
      aria-label={t("primary")}
      onPointerEnter={(event) => moveLight(event, { jump: true })}
      onPointerMove={(event) => moveLight(event)}
      className={cn(
        "group/bar pointer-events-auto relative col-start-2 row-start-1 hidden py-1 [--current:var(--primary)] md:block dark:[--current:color-mix(in_oklab,var(--primary),white_55%)]",
        // Swells a little when pressed, like the bar on small screens.
        "motion-safe:transition-[scale] motion-safe:duration-300 motion-safe:active:scale-[1.03]"
      )}
    >
      <PointerLight x={lightX} y={lightY} />
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
            className="pointer-events-none absolute bottom-0.5 left-0 h-0.5 rounded-full bg-(--current) shadow-[0_0_8px_var(--current)]"
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
                        onNavigate={() => setPending({ index, from: pathname })}
                        className={cn(
                          "relative flex h-11 items-center rounded-xl px-4 font-medium text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:transition-colors",
                          index === markedIndex ? "text-(--current)" : "text-foreground/75 hover:text-foreground"
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

/** Light around the mouse: a soft wash behind the links, and a glow along the line that the mark rests on. */
function PointerLight({ x, y }: { x: MotionValue<number>; y: MotionValue<number> }) {
  const wash = useMotionTemplate`radial-gradient(6rem circle at ${x}px ${y}px, color-mix(in oklab, var(--light) 14%, transparent), transparent)`
  const line = useMotionTemplate`radial-gradient(7rem circle at ${x}px 0px, color-mix(in oklab, var(--primary), white 25%), transparent)`
  const layer =
    "pointer-events-none absolute inset-x-0 mask-x-from-[calc(100%-2rem)] opacity-0 group-hover/bar:opacity-100 motion-safe:transition-opacity motion-safe:duration-300"

  return (
    <>
      <motion.span
        aria-hidden="true"
        style={{ background: wash }}
        // Fades out above and below, as it does at the ends, instead of stopping at an edge.
        className={cn(layer, "inset-y-0 mask-y-from-55% [--light:var(--primary)] dark:[--light:var(--foreground)]")}
      />
      <motion.span aria-hidden="true" style={{ background: line }} className={cn(layer, "bottom-1.5 h-0.5")} />
    </>
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
