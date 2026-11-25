import { useEffect, useState } from "react"

/**
 * Collapsed once the page scrolls down past the top; restored on the way up, after navigating, or on request.
 * With `pageOnly`, scrolling a pane inside the page or a dialog leaves it as it is.
 */
export function useCollapseOnScroll(pathname: string | null, { pageOnly = false } = {}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Scroll events from inner panes are captured too, each tracked against its own last position.
    const lastPositions = new WeakMap<object, number>()
    const onScroll = (event: Event) => {
      if (pageOnly && event.target instanceof Element) return
      const source = event.target instanceof Element ? event.target : window
      const y = source instanceof Element ? source.scrollTop : window.scrollY
      const lastY = lastPositions.get(source) ?? 0
      lastPositions.set(source, y)
      if (y !== lastY) setCollapsed(y > 24 && y > lastY)
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [pageOnly])

  // biome-ignore lint/correctness/useExhaustiveDependencies: expanding is a response to navigation itself.
  useEffect(() => setCollapsed(false), [pathname])

  return [collapsed, setCollapsed] as const
}
