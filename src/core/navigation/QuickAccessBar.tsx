"use client"

import { EllipsisIcon, MenuIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { type MouseEvent, type PointerEvent, type RefObject, Suspense, useEffect, useRef, useState } from "react"
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
}

/** Liquid Glass material: a clear grey tint (darkening light pages, lightening dark ones) with a light blur, a rim lit top and bottom, and a soft shadow. */
const glass =
  "relative border border-white/50 bg-neutral-250/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),inset_0_-1px_0_rgb(255_255_255/0.2),0_8px_24px_rgb(0_0_0/0.12)] backdrop-blur-sm backdrop-saturate-[1.1] dark:border-white/15 dark:bg-neutral-700/25 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),inset_0_-1px_0_rgb(255_255_255/0.06),0_8px_24px_rgb(0_0_0/0.4)]"

/** A faint top-down sheen, as if light catches the upper edge of the glass. */
const sheen =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-linear-to-b before:from-white/15 before:to-transparent before:to-60% dark:before:from-white/8"

/**
 * A white wash, hidden until the glass is pressed, that brightens it as an iOS tab bar does under a finger. The glass's
 * backdrop filter makes it a stacking context, so the negative z-index keeps the wash behind the icons.
 */
const pressWash =
  "after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:bg-white after:opacity-0 motion-safe:after:transition-opacity motion-safe:after:duration-200 motion-safe:after:ease-out"

/** Expanded, the pill spans the screen less a small gap at each side, capped so it does not sprawl on small tablets. */
const EXPANDED_WIDTH = "min(100vw - 1.5rem, 32rem)"
/** Slots are 3.5rem (56px) tall, room for an icon over its page name, and share the expanded width equally. */
const SLOT_REM = 3.5
/** Collapsed, the pill is a small horizontal capsule: 2rem (32px) wide and 1.5rem (24px) tall inside its insets. */
const COLLAPSED_WIDTH_REM = 2
const COLLAPSED_HEIGHT_REM = 1.5
/**
 * The pill's padding plus border around its contents. The sides get a little more room than top and bottom so the lens,
 * which is wider than a slot, is not clipped at either end even while it swells.
 */
const PILL_INSET_X = "calc(1rem + 2px)"
const PILL_INSET_Y = "calc(0.5rem + 2px)"
/** Explicit corner radii (half the height) let the shape morph smoothly between the two capsules. */
const EXPANDED_RADIUS = `calc((${SLOT_REM}rem + ${PILL_INSET_Y}) / 2)`
const COLLAPSED_RADIUS = `calc((${COLLAPSED_HEIGHT_REM}rem + ${PILL_INSET_Y}) / 2)`

/** Sits low, just clear of the iPhone home indicator, like a native tab bar. */
const BAR_BOTTOM = "max(env(safe-area-inset-bottom) - 0.75rem, 0.5rem)"
/** How far the bar reaches up from the bottom edge; toasts read it to stay clear of the bar. */
const BAR_OFFSET = `calc(${BAR_BOTTOM} + ${SLOT_REM}rem + ${PILL_INSET_Y})`

/**
 * Damped springs sampled into `linear()` easings. The bouncy one overshoots by about 16% and suits small scale changes;
 * the soft one overshoots by about 4% and suits the pill's width, where a full bounce would carry it past the screen
 * edge.
 */
const SPRING_BOUNCY =
  "linear(0, 0.062 3.3%, 0.215 6.7%, 0.411 10%, 0.615 13.3%, 0.799 16.7%, 0.95 20%, 1.059 23.3%, 1.126 26.7%, 1.158 30%, 1.161 33.3%, 1.145 36.7%, 1.116 40%, 1.083 43.3%, 1.051 46.7%, 1.023 50%, 1.001 53.3%, 0.986 56.7%, 0.977 60%, 0.974 63.3%, 0.974 66.7%, 0.978 70%, 0.983 73.3%, 0.988 76.7%, 0.994 80%, 0.998 83.3%, 1.001 86.7%, 1.003 90%, 1.004 93.3%, 1.004 96.7%, 1)"
const SPRING_SOFT =
  "linear(0, 0.042 3.3%, 0.145 6.7%, 0.277 10%, 0.418 13.3%, 0.554 16.7%, 0.675 20%, 0.778 23.3%, 0.861 26.7%, 0.925 30%, 0.971 33.3%, 1.003 36.7%, 1.023 40%, 1.034 43.3%, 1.038 46.7%, 1.038 50%, 1.035 53.3%, 1.03 56.7%, 1.025 60%, 1.019 63.3%, 1.014 66.7%, 1.01 70%, 1.007 73.3%, 1.004 76.7%, 1.002 80%, 1 83.3%, 0.999 86.7%, 0.999 90%, 0.999 93.3%, 0.999 96.7%, 1)"

/** How far a finger must travel along the bar before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 8
/** How long after a drag or an opening press a stray click is still swallowed. */
const CLICK_SWALLOW_MS = 350

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

function Bar({ shortcuts, items, pathname }: QuickAccessBarProps & { pathname: string | null }) {
  const t = useTranslations("Navigation")
  const router = useRouter()
  const [collapsed, setCollapsed] = useCollapseOnScroll(pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  useBottomBarOffset()

  const slotCount = shortcuts.length + 1
  const activeIndex = pathname === null ? -1 : shortcuts.findIndex((shortcut) => isActiveRoute(pathname, shortcut.href))
  const CollapsedIcon = activeIndex === -1 ? EllipsisIcon : ROUTE_ICONS[shortcuts[activeIndex].id]

  // The slot just chosen, held while its page loads so the lens does not fall back to the old page in the meantime.
  // It lapses by itself once the path changes.
  const [pending, setPending] = useState<{ index: number; from: string | null } | null>(null)
  const pendingIndex = pending?.from === pathname ? pending.index : null
  const choose = (index: number) => setPending({ index, from: pathname })

  const rowRef = useRef<HTMLDivElement>(null)
  const { dragIndex, pressed, startGesture, onClickCapture } = useDragToSelect(rowRef, slotCount, (index) => {
    // As on iOS, a drag released on the section already open keeps its current subpage; only a tap goes to its top.
    if (index === activeIndex) return
    if (index < shortcuts.length) {
      choose(index)
      router.push(shortcuts[index].href)
    } else setMenuOpen(true)
  })
  const lensIndex = dragIndex ?? pendingIndex ?? activeIndex
  const lensMoving = useIsMoving(lensIndex)

  return (
    <>
      {/*
        Keeps the end of the page clear of the fixed bar. Screens pinned to the bottom, such as a conversation, look for
        it to know the bar is there.
      */}
      <div
        aria-hidden="true"
        data-bottom-bar-spacer=""
        className="shrink-0 md:hidden"
        style={{ height: `calc(${BAR_OFFSET} + 1rem)` }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center md:hidden"
        style={{ paddingBottom: BAR_BOTTOM }}
      >
        <nav
          aria-label={t("quickAccess")}
          onClickCapture={onClickCapture}
          className={cn(
            glass,
            sheen,
            "pointer-events-auto flex origin-bottom items-center justify-center overflow-hidden px-2 py-1 motion-safe:transition-[width,height,border-radius,scale] motion-safe:duration-500",
            // Like an iOS tab bar, the glass swells and brightens a little under a finger.
            pressWash,
            pressed && !collapsed && "scale-[1.03] after:opacity-35 dark:after:opacity-5"
          )}
          style={{
            transitionTimingFunction: `${SPRING_SOFT}, ${SPRING_SOFT}, ${SPRING_SOFT}, ${SPRING_BOUNCY}`,
            width: collapsed ? `calc(${COLLAPSED_WIDTH_REM}rem + ${PILL_INSET_X})` : EXPANDED_WIDTH,
            height: `calc(${collapsed ? COLLAPSED_HEIGHT_REM : SLOT_REM}rem + ${PILL_INSET_Y})`,
            borderRadius: collapsed ? COLLAPSED_RADIUS : EXPANDED_RADIUS
          }}
        >
          <div
            ref={rowRef}
            onPointerDown={(event) => startGesture(event)}
            inert={collapsed}
            className={cn(
              "relative flex shrink-0 touch-none items-center motion-safe:transition-[opacity,scale] motion-safe:duration-400",
              collapsed && "pointer-events-none scale-75 opacity-0"
            )}
            style={{
              // Fixed at the expanded width so the slots keep their size while the pill shrinks around them.
              width: `calc(${EXPANDED_WIDTH} - ${PILL_INSET_X})`,
              transitionTimingFunction: SPRING_BOUNCY
            }}
          >
            {/*
              The lens: one wide glass pill, centred in its slot, that rests on the current page, follows a dragging
              finger, and swells slightly while it is on the move. The outer track steps a whole slot at a time.
            */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center motion-safe:transition-[translate,opacity] motion-safe:duration-200 motion-safe:ease-out",
                lensIndex === -1 && "opacity-0"
              )}
              style={{ width: `calc(100% / ${slotCount})`, translate: `${Math.max(lensIndex, 0) * 100}% 0` }}
            >
              {/* No spring here: retargeted slot by slot under a dragging finger, an overshoot makes the lens wobble. */}
              <span
                className={cn(
                  "h-[3.375rem] w-[calc(100%+0.5rem)] max-w-28 shrink-0 rounded-full bg-foreground/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] motion-safe:transition-[scale,background-color] motion-safe:duration-200 motion-safe:ease-out dark:bg-white/15",
                  (dragIndex !== null || lensMoving) && "scale-[1.1]",
                  dragIndex !== null && "bg-foreground/15 dark:bg-white/25"
                )}
              />
            </span>
            {shortcuts.map((shortcut, index) => {
              const Icon = ROUTE_ICONS[shortcut.id]
              return (
                <Link
                  key={shortcut.id}
                  href={shortcut.href}
                  aria-current={index === activeIndex ? "page" : undefined}
                  onClick={() => choose(index)}
                  className={slotClass(index === lensIndex)}
                >
                  <Icon className="size-6" aria-hidden="true" />
                  <SlotLabel>{shortcut.label}</SlotLabel>
                </Link>
              )
            })}
            <MobileNavigation
              items={items}
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
                children: (
                  <>
                    <MenuIcon className="size-6" aria-hidden="true" />
                    <SlotLabel>{t("menu")}</SlotLabel>
                  </>
                )
              }}
            />
          </div>
          <button
            type="button"
            aria-label={t("showQuickAccess")}
            inert={!collapsed}
            onClick={() => setCollapsed(false)}
            // Expands on touch-down rather than on release, so the same finger can slide straight onto a slot.
            onPointerDown={(event) => {
              setCollapsed(false)
              startGesture(event, { swallowTap: true })
            }}
            className={cn(
              "absolute inset-0 flex touch-none items-center justify-center rounded-[inherit] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[opacity,scale] motion-safe:duration-400",
              collapsed ? "opacity-100" : "pointer-events-none scale-50 opacity-0"
            )}
            style={{ transitionTimingFunction: SPRING_BOUNCY }}
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
    "relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
    highlighted && "text-foreground"
  )
}

/** The page name under a slot's icon, cut short with an ellipsis when it does not fit. */
function SlotLabel({ children }: { children: string }) {
  return <span className="max-w-full truncate px-1 font-medium text-[0.625rem] leading-tight">{children}</span>
}

/**
 * Lets a finger slide along the row of slots: past a small threshold the press becomes a drag that reports the slot
 * under the finger, and releasing selects it. A press that never moves stays an ordinary tap on the slot it hit.
 * A gesture may also begin off the row, on the collapsed pill, so one motion can expand the bar and pick a slot;
 * `swallowTap` then keeps a press that never moves from also tapping whichever slot the bar opened under it.
 * `pressed` is true while a finger (not a mouse) is down.
 */
function useDragToSelect(rowRef: RefObject<HTMLElement | null>, slotCount: number, onSelect: (index: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [pressed, setPressed] = useState(false)
  const stopGesture = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  const suppressTimer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      stopGesture.current?.()
      window.clearTimeout(suppressTimer.current)
    },
    []
  )

  /**
   * Swallows the click the browser may still fire for a press that dragged or that opened the bar. iOS sends it a beat
   * after the finger lifts, and may send it even after cancelling the touch, so it is held off until that click arrives
   * or a short while has passed, rather than for a single tick.
   */
  const swallowNextClick = () => {
    suppressClick.current = true
    window.clearTimeout(suppressTimer.current)
    suppressTimer.current = window.setTimeout(() => {
      suppressClick.current = false
    }, CLICK_SWALLOW_MS)
  }

  /** Measured live, so a finger maps onto the slots as drawn even while the row is still scaling in. */
  const indexAt = (clientX: number) => {
    const row = rowRef.current?.getBoundingClientRect()
    return row ? slotIndexAt(clientX - row.left, row.width, slotCount) : null
  }

  const startGesture = (event: PointerEvent<HTMLElement>, { swallowTap = false } = {}) => {
    // A second finger while one is already down is ignored.
    if (event.button !== 0 || stopGesture.current) return
    const { pointerId, clientX: startX } = event
    let dragging = false
    if (event.pointerType !== "mouse") setPressed(true)
    // Armed from the start: the bar opening under the finger can make the browser cancel the touch.
    if (swallowTap) swallowNextClick()

    // Window listeners follow the pointer wherever it goes: from the collapsed pill onto the row, or off the bar.
    const move = (moved: globalThis.PointerEvent) => {
      if (moved.pointerId !== pointerId) return
      if (!dragging && Math.abs(moved.clientX - startX) < DRAG_THRESHOLD_PX) return
      dragging = true
      setDragIndex(indexAt(moved.clientX))
    }
    const end = (ended: globalThis.PointerEvent) => {
      if (ended.pointerId !== pointerId) return
      stop()
      if (!(dragging || swallowTap)) return
      swallowNextClick()
      const index = dragging && ended.type === "pointerup" ? indexAt(ended.clientX) : null
      if (index !== null) onSelect(index)
    }
    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      stopGesture.current = null
      setPressed(false)
      setDragIndex(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    stopGesture.current = stop
  }

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { dragIndex, pressed, startGesture, onClickCapture }
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
