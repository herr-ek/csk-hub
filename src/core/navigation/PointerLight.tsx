"use client"

import { type MotionValue, motion, useMotionTemplate, useReducedMotion, useSpring } from "motion/react"
import type { PointerEvent } from "react"
import { cn } from "@/shared/utils"

/** Where the light over a bar is. It trails the pointer, but starts where it enters rather than where it last left. */
export function usePointerLight() {
  const reduceMotion = useReducedMotion()
  const x = useSpring(0, { stiffness: 350, damping: 35 })
  const y = useSpring(0, { stiffness: 350, damping: 35 })

  function follow(event: PointerEvent<HTMLElement>, { jump = false } = {}) {
    const box = event.currentTarget.getBoundingClientRect()
    const move = jump || reduceMotion ? "jump" : "set"
    x[move](event.clientX - box.left)
    y[move](event.clientY - box.top)
  }

  return { x, y, follow }
}

/**
 * Light around the pointer: a soft wash behind the links, and a glow along the line that the mark rests on. It shows
 * while its `group/bar` is hovered or, for a finger, has `data-pressed`.
 */
export function PointerLight({ x, y }: { x: MotionValue<number>; y: MotionValue<number> }) {
  const wash = useMotionTemplate`radial-gradient(6rem circle at ${x}px ${y}px, color-mix(in oklab, var(--light) 14%, transparent), transparent)`
  const line = useMotionTemplate`radial-gradient(7rem circle at ${x}px 0px, color-mix(in oklab, var(--primary), white 25%), transparent)`
  const layer =
    "pointer-events-none absolute inset-x-0 mask-x-from-[calc(100%-2rem)] opacity-0 group-hover/bar:opacity-100 group-data-pressed/bar:opacity-100 motion-safe:transition-opacity motion-safe:duration-300"

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
