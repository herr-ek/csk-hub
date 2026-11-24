"use client"

import { LoaderCircle, Search } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { useFormStatus } from "react-dom"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"

const swap = {
  initial: { opacity: 0, scale: 0.5, rotate: -90 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.5, rotate: 90 },
  transition: { duration: 0.15 }
} as const

/** Submits the News search; the magnifier turns into a spinner while the results load. */
export function NewsSearchButton() {
  const { pending } = useFormStatus()
  const t = useTranslations("Posts")
  return (
    <MotionConfig reducedMotion="user">
      <Button type="submit" disabled={pending} aria-busy={pending}>
        <span className="grid size-4 place-items-center" aria-hidden="true">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={pending ? "pending" : "idle"} className="flex" {...swap}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            </motion.span>
          </AnimatePresence>
        </span>
        {t(pending ? "searching" : "search")}
      </Button>
    </MotionConfig>
  )
}

/**
 * Fades and lifts its content in when it first mounts. `order` is the place within the page
 * just loaded, so each new page of the feed staggers from its own top.
 */
export function Reveal({ order = 0, children }: { order?: number; children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        // Capped, so the last card of a long page does not trail in long after the first.
        transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(order, 8) * 0.04 }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  )
}
