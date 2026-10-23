"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** How long the app must have been out of view before coming back refreshes it. */
const AWAY_MS = 30_000

/**
 * Re-renders the server-rendered parts of the page, such as the navigation's unread badges,
 * when the User comes back to the app after a while. A stop-gap until realtime updates (#53):
 * without it, the badges only change after the User's own actions. Client state, such as an
 * unsent draft, survives the refresh.
 */
export function RefreshOnReturn() {
  const router = useRouter()

  useEffect(() => {
    let hiddenAt: number | null = null
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
      } else if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) {
        hiddenAt = null
        router.refresh()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [router])

  return null
}
