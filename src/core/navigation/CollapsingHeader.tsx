"use client"

import { usePathname } from "next/navigation"
import { type FocusEvent, type PointerEvent, type ReactNode, useState } from "react"
import { NavigationFrame } from "./NavigationFrame"
import { useCollapseOnScroll } from "./use-collapse-on-scroll"

/** The header, collapsed from `md` up while the page scrolls down, unless the mouse or keyboard focus is in it. */
export function CollapsingHeader({ children }: { children: ReactNode }) {
  const [scrolledDown] = useCollapseOnScroll(usePathname(), { pageOnly: true })
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <NavigationFrame
      data-collapsed={scrolledDown && !hovered && !focused ? "" : undefined}
      onPointerEnter={(event: PointerEvent) => setHovered(event.pointerType === "mouse")}
      onPointerLeave={() => setHovered(false)}
      // Focus left behind by a click doesn't count, or the header would stay open after every click.
      onFocus={(event: FocusEvent) => setFocused(event.target.matches(":focus-visible"))}
      onBlur={(event: FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      {children}
    </NavigationFrame>
  )
}
