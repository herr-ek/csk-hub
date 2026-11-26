"use client"

import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { type FocusEvent, type KeyboardEvent, type ReactNode, useState } from "react"
import { cn } from "@/shared/utils"

// Adapted from motion.dev's Clerk user button: the button and the open panel share a layoutId so Motion morphs one into
// the other.
export const spring = { type: "spring", bounce: 0.15, visualDuration: 0.25 } as const

/** Content that blurs in once the panel has opened, and out as it closes. */
export const reveal = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)", transition: { delay: 0.15 } },
  exit: { opacity: 0, filter: "blur(8px)" }
}

// Module-level so React calls it once per mount, not on every render.
function focusOnMount(element: HTMLElement | null) {
  element?.focus({ preventScroll: true })
}

export interface MorphMenuProps {
  /** Shared by the button and the panel. Each menu needs its own, or Motion morphs between menus. */
  layoutId: string
  /** The accessible names of the closed button and of the open panel. */
  buttonLabel: string
  panelLabel: string
  /** What the closed button shows. */
  button: ReactNode
  buttonClassName?: string
  /** Where the panel opens from, and its width. */
  panelClassName: string
  /** The panel's contents. `close(true)` also hands focus back to the button. */
  children: (close: (focusButton?: boolean) => void) => ReactNode
}

/**
 * A round button that morphs into a panel and back. The panel closes on Escape, when focus leaves it, and, on small
 * screens, on a tap anywhere outside it.
 */
export function MorphMenu({
  layoutId,
  buttonLabel,
  panelLabel,
  button,
  buttonClassName,
  panelClassName,
  children
}: MorphMenuProps) {
  const [open, setOpen] = useState(false)
  // Only Escape, or the menu itself asking, hands focus back to the button; other closes leave focus where it went.
  const [refocusButton, setRefocusButton] = useState(false)

  function close(focusButton = false) {
    setRefocusButton(focusButton)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") close(true)
  }

  // Covers clicking outside and tabbing away. The panel is focusable, so clicks inside it keep focus within.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative size-9">
        {open ? (
          // On small screens, a layer that catches taps and swipes outside the panel, so they close it rather than
          // press or scroll the page. Pressing it keeps focus in the panel, so the panel closes on the click rather than
          // on losing focus, by which time the layer could be gone and the click would go through.
          <div
            aria-hidden="true"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => close()}
            className="pointer-events-auto fixed inset-0 z-40 touch-none md:hidden"
          />
        ) : null}
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              role="dialog"
              aria-label={panelLabel}
              layoutId={layoutId}
              transition={spring}
              style={{ borderRadius: 24 }}
              ref={focusOnMount}
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className={cn(
                "absolute z-50 touch-none overflow-hidden bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none dark:ring-foreground/10",
                panelClassName
              )}
            >
              {children(close)}
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              type="button"
              layoutId={layoutId}
              transition={spring}
              style={{ borderRadius: 999 }}
              ref={refocusButton ? focusOnMount : undefined}
              aria-label={buttonLabel}
              aria-expanded={false}
              onClick={() => setOpen(true)}
              // Not buttonVariants: its transition-all, active translate and border fight Motion's per-frame transforms.
              className={cn(
                "absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                buttonClassName
              )}
            >
              {button}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
