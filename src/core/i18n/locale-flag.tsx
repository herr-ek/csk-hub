import { useId, useSyncExternalStore } from "react"
import { cn } from "@/shared/utils"
import type { Locale } from "./locales"

// `size-full` keeps the select's `[&_svg:not([class*='size-'])]:size-4` rule from resizing the flags.
const svgProps = {
  className: "size-full",
  preserveAspectRatio: "xMidYMid slice",
  "aria-hidden": true
} as const

function UnitedKingdomFlag() {
  const id = useId()
  return (
    <svg viewBox="0 0 60 30" {...svgProps}>
      <clipPath id={`${id}-t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}-t)`} stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

function SwedenFlag() {
  return (
    <svg viewBox="0 0 16 10" {...svgProps}>
      <rect width="16" height="10" fill="#006AA7" />
      <rect x="5" width="2" height="10" fill="#FECC02" />
      <rect y="4" width="16" height="2" fill="#FECC02" />
    </svg>
  )
}

function BelgiumFlag() {
  return (
    <svg viewBox="0 0 3 2" {...svgProps}>
      <rect width="1" height="2" fill="#000" />
      <rect x="1" width="1" height="2" fill="#FDDA24" />
      <rect x="2" width="1" height="2" fill="#EF3340" />
    </svg>
  )
}

let belgianEasterEggRoll: boolean | undefined
const subscribeToNothing = () => () => {}

/**
 * Easter egg: on one page load in four, German is shown with the Belgian flag.
 *
 * Rolled once per page load in the browser, so every German flag on the page agrees. The server
 * always renders the real flag, which keeps hydration consistent.
 */
function useBelgianEasterEgg() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => (belgianEasterEggRoll ??= Math.random() < 0.25),
    () => false
  )
}

function GermanyFlag() {
  // Easter egg — comment out this line to disable it.
  if (useBelgianEasterEgg()) return <BelgiumFlag />

  return (
    <svg viewBox="0 0 5 3" {...svgProps}>
      <rect width="5" height="1" fill="#000" />
      <rect y="1" width="5" height="1" fill="#DD0000" />
      <rect y="2" width="5" height="1" fill="#FFCE00" />
    </svg>
  )
}

const flags = {
  en: UnitedKingdomFlag,
  sv: SwedenFlag,
  de: GermanyFlag
} satisfies Record<Locale, () => React.ReactNode>

/** A decorative flag for a locale, cropped to one shared size so the options line up. */
export function LocaleFlag({ locale, className }: { locale: Locale; className?: string }) {
  const Flag = flags[locale]
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/10",
        className
      )}
    >
      <Flag />
    </span>
  )
}
