"use client"

import { EllipsisIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { type MouseEvent, type PointerEvent, type RefObject, Suspense, useEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { cn } from "@/shared/utils"
import { DESTINATIONS, MENUS, visibleDestinations } from "./destinations"
import { isActiveRoute } from "./navigation-utils"
import { PointerLight, usePointerLight } from "./PointerLight"
import { slotIndexAt } from "./quick-access"
import { useCollapseOnScroll } from "./use-collapse-on-scroll"
import { usePendingIndex } from "./use-pending-index"

/** The main navigation slots, in order. The bar is the same for every User, so it leaves out what only Admins see. */
const SHORTCUTS = visibleDestinations(MENUS.quickAccess, { showAdmin: false }).map((id) => DESTINATIONS[id])

/** Expanded, the bar spans the screen less a small gap at each side, capped so it does not sprawl on small tablets. */
const EXPANDED_WIDTH = "min(100vw - 1.5rem, 32rem)"
/** Slots are 3.5rem (56px) tall, room for an icon over its page name, and share the expanded width equally. */
const SLOT_REM = 3.5
/** Collapsed, the bar is a single small button: 2rem (32px) wide and 1.5rem (24px) tall inside its insets. */
const COLLAPSED_WIDTH_REM = 2
const COLLAPSED_HEIGHT_REM = 1.5
/** The bar's padding around its contents. */
const BAR_INSET_X = "calc(1rem + 2px)"
const BAR_INSET_Y = "calc(0.5rem + 2px)"
/** Explicit corner radii (half the height) let the bar's shape, and its focus ring, morph smoothly as it collapses. */
const EXPANDED_RADIUS = `calc((${SLOT_REM}rem + ${BAR_INSET_Y}) / 2)`
const COLLAPSED_RADIUS = `calc((${COLLAPSED_HEIGHT_REM}rem + ${BAR_INSET_Y}) / 2)`

/** Sits low, just clear of the iPhone home indicator, like a native tab bar. */
const BAR_BOTTOM = "max(env(safe-area-inset-bottom) - 0.75rem, 0.5rem)"
/** How far the bar reaches up from the bottom edge; toasts read it to stay clear of the bar. */
const BAR_OFFSET = `calc(${BAR_BOTTOM} + ${SLOT_REM}rem + ${BAR_INSET_Y})`
const COLLAPSED_OFFSET = `calc(${BAR_BOTTOM} + ${COLLAPSED_HEIGHT_REM}rem + ${BAR_INSET_Y})`

/**
 * Damped springs sampled into `linear()` easings. The bouncy one overshoots by about 16% and suits small scale changes;
 * the soft one overshoots by about 4% and suits the bar's width, where a full bounce would carry it past the screen
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
 * The main sections along the bottom of small screens, styled like the header's links: names under icons floating over
 * the page, which blurs away beneath them, and a glowing mark under the current section.
 * Sliding a finger along the bar drags the mark across the slots and opens the one it is released on.
 * While the page scrolls down the bar collapses into a single small button; tapping it or scrolling up restores it.
 */
export function QuickAccessBar() {
  return (
    <Suspense fallback={<Bar pathname={null} />}>
      <CurrentBar />
    </Suspense>
  )
}

function CurrentBar() {
  return <Bar pathname={usePathname()} />
}

function Bar({ pathname }: { pathname: string | null }) {
  const t = useTranslations("Navigation")
  const router = useRouter()
  const [collapsed, setCollapsed] = useCollapseOnScroll(pathname)
  useBottomBarOffset()

  const slotCount = SHORTCUTS.length
  const activeIndex = pathname === null ? -1 : SHORTCUTS.findIndex((shortcut) => isActiveRoute(pathname, shortcut.href))
  const CollapsedIcon = activeIndex === -1 ? EllipsisIcon : SHORTCUTS[activeIndex].icon

  const [pendingIndex, choose] = usePendingIndex(pathname)

  const rowRef = useRef<HTMLDivElement>(null)
  const { dragIndex, pressed, startGesture, onClickCapture } = useDragToSelect(rowRef, slotCount, (index) => {
    // As on iOS, a drag released on the section already open keeps its current subpage; only a tap goes to its top.
    if (index === activeIndex) return
    choose(index)
    router.push(SHORTCUTS[index].href)
  })
  const markIndex = dragIndex ?? pendingIndex ?? activeIndex
  const markMoving = useIsMoving(markIndex)
  const light = usePointerLight()

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
        {/* Keeps the bar readable over whatever scrolls beneath it, as the header does, and shrinks with it. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 -z-10 mask-t-from-50% bg-background/80 backdrop-blur-lg motion-safe:transition-[height] motion-safe:duration-500"
          style={{
            height: `calc(${collapsed ? COLLAPSED_OFFSET : BAR_OFFSET} + 1.5rem)`,
            transitionTimingFunction: SPRING_SOFT
          }}
        />
        <nav
          aria-label={t("quickAccess")}
          data-pressed={pressed && !collapsed ? "" : undefined}
          onClickCapture={onClickCapture}
          onPointerDown={(event) => light.follow(event, { jump: true })}
          onPointerMove={(event) => light.follow(event)}
          className={cn(
            "group/bar relative pointer-events-auto flex origin-bottom items-center justify-center overflow-hidden px-2 py-1 motion-safe:transition-[width,height,border-radius,scale] motion-safe:duration-500",
            // Like the header's links, the bar swells a little under a finger, and a light follows it.
            pressed && !collapsed && "scale-[1.03]"
          )}
          style={{
            transitionTimingFunction: `${SPRING_SOFT}, ${SPRING_SOFT}, ${SPRING_SOFT}, ${SPRING_BOUNCY}`,
            width: collapsed ? `calc(${COLLAPSED_WIDTH_REM}rem + ${BAR_INSET_X})` : EXPANDED_WIDTH,
            height: `calc(${collapsed ? COLLAPSED_HEIGHT_REM : SLOT_REM}rem + ${BAR_INSET_Y})`,
            borderRadius: collapsed ? COLLAPSED_RADIUS : EXPANDED_RADIUS
          }}
        >
          <PointerLight x={light.x} y={light.y} />
          <div
            ref={rowRef}
            onPointerDown={(event) => startGesture(event)}
            inert={collapsed}
            className={cn(
              "relative flex shrink-0 touch-none items-center motion-safe:transition-[opacity,scale] motion-safe:duration-400",
              collapsed && "pointer-events-none scale-75 opacity-0"
            )}
            style={{
              // Fixed at the expanded width so the slots keep their size while the bar shrinks around them.
              width: `calc(${EXPANDED_WIDTH} - ${BAR_INSET_X})`,
              transitionTimingFunction: SPRING_BOUNCY
            }}
          >
            {/*
              The mark: a glowing line under the current section, as in the header, that follows a dragging finger and
              stretches while it is on the move. The outer track steps a whole slot at a time.
            */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 flex items-end justify-center motion-safe:transition-[translate,opacity] motion-safe:duration-200 motion-safe:ease-out",
                markIndex === -1 && "opacity-0"
              )}
              style={{ width: `calc(100% / ${slotCount})`, translate: `${Math.max(markIndex, 0) * 100}% 0` }}
            >
              {/* No spring here: retargeted slot by slot under a dragging finger, an overshoot makes the mark wobble. */}
              <span
                className={cn(
                  "mb-px h-0.5 w-8 nav-mark motion-safe:transition-[scale] motion-safe:duration-200 motion-safe:ease-out",
                  (dragIndex !== null || markMoving) && "scale-x-150"
                )}
              />
            </span>
            {SHORTCUTS.map(({ label, href, icon: Icon }, index) => (
              <Link
                key={label}
                href={href}
                aria-current={index === activeIndex ? "page" : undefined}
                onClick={() => choose(index)}
                className={slotClass(index === markIndex)}
              >
                <Icon className="size-6" aria-hidden="true" />
                <SlotLabel>{t(label)}</SlotLabel>
              </Link>
            ))}
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
              "absolute inset-0 flex touch-none items-center justify-center rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[opacity,scale] motion-safe:duration-400",
              activeIndex === -1 ? "text-foreground" : "text-(--nav-current)",
              collapsed ? "opacity-100" : "pointer-events-none scale-50 opacity-0"
            )}
            style={{ transitionTimingFunction: SPRING_BOUNCY }}
          >
            <CollapsedIcon className="size-5" aria-hidden="true" />
            {activeIndex === -1 ? null : <span aria-hidden="true" className="absolute bottom-px h-0.5 w-4 nav-mark" />}
          </button>
        </nav>
      </div>
    </>
  )
}

function slotClass(highlighted: boolean) {
  return cn(
    "relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-foreground/75 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors",
    highlighted && "text-(--nav-current)"
  )
}

/** The page name under a slot's icon, cut short with an ellipsis when it does not fit. */
function SlotLabel({ children }: { children: string }) {
  return <span className="max-w-full truncate px-1 font-medium text-[0.625rem] leading-tight">{children}</span>
}

/**
 * Lets a finger slide along the row of slots: past a small threshold the press becomes a drag that reports the slot
 * under the finger, and releasing selects it. A press that never moves stays an ordinary tap on the slot it hit.
 * A gesture may also begin off the row, on the collapsed bar, so one motion can expand the bar and pick a slot;
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

    // Window listeners follow the pointer wherever it goes: from the collapsed bar onto the row, or off the bar.
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

/** True for a moment after `index` changes from one slot to another, while the mark slides across. */
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
