"use server"

import { refresh } from "next/cache"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { markNewsFeedSeen } from "./service"

/** Stamps the News feed as seen through `latestPostId`, then refreshes the badges. */
export async function markNewsFeedSeenAction(latestPostId: string) {
  const userId = await requireAuthenticatedUser()
  // The navigation lives in the layout, which a client navigation to the feed keeps; only
  // a refresh re-renders its badge.
  if (await markNewsFeedSeen(userId, latestPostId)) refresh()
}
