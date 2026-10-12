"use client"

import { EllipsisIcon, MenuIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { type MouseEvent, type PointerEvent, Suspense, useEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { cn } from "@/shared/utils"
import { MobileNavigation } from "./MobileNavigation"
import type { NavLinkItem } from "./NavLinks"
import { isActiveRoute } from "./navigation-utils"
import { slotIndexAt } from "./quick-access"
import { ROUTE_ICONS } from "./route-icons"
import type { MenuRouteId } from "./site"

export type QuickAccessShortcut = { id: MenuRouteId; href: string; label: string }

export interface QuickAccessBarProps {
  shortcuts: QuickAccessShortcut[]
  /** The menu sheet's links, opened from the bar's last slot. */
  items: NavLinkItem[]
  isImpersonating: boolean
}

/** Liquid Glass material: a clear grey tint (darkening light pages, lightening dark ones) with a light blur, a rim lit top and bottom, and a soft shadow. */
const glass =
  "relative border border-white/50 bg-neutral-250/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),inset_0_-1px_0_rgb(255_255_255/0.2),0_8px_24px_rgb(0_0_0/0.12)] backdrop-blur-sm backdrop-saturate-[1.1] dark:border-white/15 dark:bg-neutral-500/20 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),inset_0_-1px_0_rgb(255_255_255/0.06),0_8px_24px_rgb(0_0_0/0.4)]"

/** A faint top-down sheen, as if light catches the upper edge of the glass. */
const sheen =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-linear-to-b before:from-white/15 before:to-transparent before:to-60% dark:before:from-white/8"

/** Expanded, each slot is a 3rem (48px) circle with a 0.5rem gap, so slot `i` starts at `i * 3.5rem`. */
const SLOT_REM = 3
const SLOT_GAP_REM = 0.5
const SLOT_PITCH_REM = SLOT_REM + SLOT_GAP_REM
/** Collapsed, the pill is a small horizontal capsule: 2rem (32px) wide and 1.5rem (24px) tall inside its insets. */
const COLLAPSED_WIDTH_REM = 2
const COLLAPSED_HEIGHT_REM = 1.5
/**
 * The pill's padding plus border around its contents. The sides get a little more room than top and bottom so the lens,
 * which is wider than a slot, is not clipped at either end even while it swells.
 */
const PILL_INSET_X = "calc(0.75rem + 2px)"
const PILL_INSET_Y = "calc(0.5rem + 2px)"
/** Explicit corner radii (half the height) let the shape morph smoothly between the two capsules. */
const EXPANDED_RADIUS = `calc((${SLOT_REM}rem + ${PILL_INSET_Y}) / 2)`
const COLLAPSED_RADIUS = `calc((${COLLAPSED_HEIGHT_REM}rem + ${PILL_INSET_Y}) / 2)`

/** Sits low, just clear of the iPhone home indicator, like a native tab bar. */
const BAR_BOTTOM = "max(env(safe-area-inset-bottom) - 0.75rem, 0.5rem)"
/** How far the bar reaches up from the bottom edge; toasts read it to stay clear of the bar. */
const BAR_OFFSET = `calc(${BAR_BOTTOM} + ${SLOT_REM}rem + ${PILL_INSET_Y})`

/** How far a finger must travel along the bar before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 8

/**
 * The member's quick-access shortcuts in a floating glass pill on small screens, with the menu in the last slot.
 * Sliding a finger along the pill drags the highlight across the slots and opens the one it is released on.
 * While the page scrolls down the pill collapses into a single small button; tapping it or scrolling up restores it.
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
  const router = useRouter()
  const [collapsed, setCollapsed] = useCollapseOnScroll(pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  useBottomBarOffset()

  const slotCount = shortcuts.length + 1
  const activeIndex = pathname === null ? -1 : shortcuts.findIndex((shortcut) => isActiveRoute(pathname, shortcut.href))
  const CollapsedIcon = activeIndex === -1 ? EllipsisIcon : ROUTE_ICONS[shortcuts[activeIndex].id]

  const { dragIndex, handlers } = useDragToSelect(slotCount, (index) => {
    if (index < shortcuts.length) router.push(shortcuts[index].href)
    else setMenuOpen(true)
  })
  const lensIndex = dragIndex ?? activeIndex
  const lensMoving = useIsMoving(lensIndex)

  return (
    <>
      {/* Keeps the end of the page, such as the message composer, clear of the fixed bar. */}
      <div aria-hidden="true" className="shrink-0 md:hidden" style={{ height: `calc(${BAR_OFFSET} + 1rem)` }} />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 md:hidden"
        style={{ paddingBottom: BAR_BOTTOM }}
      >
        <nav
          aria-label={t("quickAccess")}
          className={cn(
            glass,
            sheen,
            "pointer-events-auto flex items-center justify-center overflow-hidden px-1.5 py-1 motion-safe:transition-[width,height,border-radius] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          )}
          style={{
            width: `calc(${collapsed ? COLLAPSED_WIDTH_REM : slotCount * SLOT_PITCH_REM - SLOT_GAP_REM}rem + ${PILL_INSET_X})`,
            height: `calc(${collapsed ? COLLAPSED_HEIGHT_REM : SLOT_REM}rem + ${PILL_INSET_Y})`,
            borderRadius: collapsed ? COLLAPSED_RADIUS : EXPANDED_RADIUS
          }}
        >
          <div
            {...handlers}
            inert={collapsed}
            className={cn(
              "relative flex shrink-0 touch-none items-center gap-2 motion-safe:transition-[opacity,scale] motion-safe:duration-200",
              collapsed && "pointer-events-none scale-75 opacity-0"
            )}
          >
            {/*
              The lens: one horizontal glass capsule, a little wider than its slot and centred on it, that rests on the
              current page, follows a dragging finger, and swells slightly while it is on the move.
            */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-px -left-1 h-[2.875rem] w-14 rounded-full bg-foreground/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] motion-safe:transition-[translate,scale,opacity] motion-safe:duration-200 motion-safe:ease-out dark:bg-white/15",
                lensIndex === -1 && "opacity-0",
                (dragIndex !== null || lensMoving) && "scale-[1.12]",
                dragIndex !== null && "bg-foreground/15 dark:bg-white/25"
              )}
              style={{ translate: `${Math.max(lensIndex, 0) * SLOT_PITCH_REM}rem 0` }}
            />
            {shortcuts.map((shortcut, index) => {
              const Icon = ROUTE_ICONS[shortcut.id]
              return (
                <Link
                  key={shortcut.id}
                  href={shortcut.href}
                  aria-label={shortcut.label}
                  aria-current={index === activeIndex ? "page" : undefined}
                  className={slotClass(index === lensIndex)}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </Link>
              )
            })}
            <MobileNavigation
              items={items}
              isImpersonating={isImpersonating}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              trigger={{
                render: (
                  <button
                    type="button"
                    aria-label={t("openMenu")}
                    className={slotClass(dragIndex === shortcuts.length)}
                  />
                ),
                children: <MenuIcon className="size-6" aria-hidden="true" />
              }}
            />
          </div>
          <button
            type="button"
            aria-label={t("showQuickAccess")}
            inert={!collapsed}
            onClick={() => setCollapsed(false)}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-[inherit] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[opacity,scale] motion-safe:duration-200",
              collapsed ? "opacity-100" : "pointer-events-none scale-50 opacity-0"
            )}
          >
            <CollapsedIcon className="size-5" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </>
  )
}

function slotClass(highlighted: boolean) {
  return cn(
    "relative flex size-12 items-center justify-center rounded-full text-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
    highlighted && "text-foreground"
  )
}

/**
 * Lets a finger slide along the row of slots: past a small threshold the press becomes a drag that reports the slot
 * under the finger, and releasing selects it. A press that never moves stays an ordinary tap on the slot it hit.
 */
function useDragToSelect(slotCount: number, onSelect: (index: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const gesture = useRef<{ pointerId: number; startX: number; dragging: boolean } | null>(null)
  const suppressClick = useRef(false)

  const indexAt = (event: PointerEvent<HTMLElement>) => {
    const row = event.currentTarget.getBoundingClientRect()
    return slotIndexAt(event.clientX - row.left, row.width, slotCount)
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return
      gesture.current = { pointerId: event.pointerId, startX: event.clientX, dragging: false }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = gesture.current
      if (current?.pointerId !== event.pointerId) return
      if (!current.dragging) {
        if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return
        current.dragging = true
        // Capturing only once it is a drag keeps plain taps landing on the link or button they hit.
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      setDragIndex(indexAt(event))
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const current = gesture.current
      gesture.current = null
      if (!current?.dragging) return
      setDragIndex(null)
      // The browser may still fire a click for the press; it must not also activate the slot it started on.
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      })
      onSelect(indexAt(event))
    },
    onPointerCancel() {
      gesture.current = null
      setDragIndex(null)
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return { dragIndex, handlers }
}

/** True for a moment after `index` changes from one slot to another, while the lens slides across. */
function useIsMoving(index: number, duration = 250) {
  const [moving, setMoving] = useState(false)
  const previous = useRef(index)

  useEffect(() => {
    const from = previous.current
    previous.current = index
    if (from === index || from === -1 || index === -1) return
    setMoving(true)
    const timer = window.setTimeout(() => setMoving(false), duration)
    return () => window.clearTimeout(timer)
  }, [index, duration])

  return moving
}

/** Collapsed once the page scrolls down past the top; restored on the way up, after navigating, or on request. */
function useCollapseOnScroll(pathname: string | null) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Scroll events from inner panes are captured too, each tracked against its own last position.
    const lastPositions = new WeakMap<object, number>()
    const onScroll = (event: Event) => {
      const source = event.target instanceof Element ? event.target : window
      const y = source instanceof Element ? source.scrollTop : window.scrollY
      const lastY = lastPositions.get(source) ?? 0
      lastPositions.set(source, y)
      if (y !== lastY) setCollapsed(y > 24 && y > lastY)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: expanding is a response to navigation itself.
  useEffect(() => setCollapsed(false), [pathname])

  return [collapsed, setCollapsed] as const
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
