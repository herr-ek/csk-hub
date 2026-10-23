"use client"

import { useEffect } from "react"
import { markPostReadAction } from "./actions"

/**
 * Marks the Post read once it is on screen. An effect rather than a write during render,
 * so prefetching a Post does not mark it read before the User has opened it.
 */
export function PostReadMarker({ postId }: { postId: string }) {
  useEffect(() => {
    // The action logs its own failures; what reaches here is the network, and the badge
    // simply stays until the next visit.
    void markPostReadAction(postId).catch(() => {})
  }, [postId])
  return null
}
