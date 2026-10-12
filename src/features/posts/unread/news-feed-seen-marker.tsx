"use client"

import { useEffect } from "react"
import { markNewsFeedSeenAction } from "./actions"

/**
 * Marks the feed seen once it is on screen. An effect rather than a write during render,
 * so prefetching the feed does not clear a badge the User never looked past.
 */
export function NewsFeedSeenMarker({ latestPostId }: { latestPostId: string }) {
  useEffect(() => {
    void markNewsFeedSeenAction(latestPostId).catch(() => {})
  }, [latestPostId])
  return null
}
