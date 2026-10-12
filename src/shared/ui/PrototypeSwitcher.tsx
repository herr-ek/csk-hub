"use client"

// PROTOTYPE — throwaway variant switcher. Lives on the 64-bottom-bar-prototype branch only; never merge.

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useEffect } from "react"

export type PrototypeVariant = { key: string; name: string }

export function PrototypeSwitcher({
  variants,
  current,
  onChange
}: {
  variants: readonly PrototypeVariant[]
  current: string
  onChange: (key: string) => void
}) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  )
  const step = (by: number) => onChange(variants[(index + by + variants.length) % variants.length].key)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable]")) return
      if (event.key === "ArrowLeft") step(-1)
      if (event.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  const variant = variants[index]
  return (
    <div className="fixed top-16 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-1.5 py-1 font-mono text-xs text-white shadow-lg ring-2 ring-fuchsia-500">
      <button
        type="button"
        aria-label="Previous variant"
        className="rounded-full p-1 hover:bg-white/20"
        onClick={() => step(-1)}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-1 whitespace-nowrap">{`${variant.key} — ${variant.name}`}</span>
      <button
        type="button"
        aria-label="Next variant"
        className="rounded-full p-1 hover:bg-white/20"
        onClick={() => step(1)}
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  )
}
