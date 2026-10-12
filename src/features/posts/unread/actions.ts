"use server"

import { refresh } from "next/cache"
import { requireAuthenticatedUser } from "@/core/auth/session.server"
import { markPostRead } from "./service"

/** Marks the Post read for the signed-in User, then refreshes the unread badges. */
export async function markPostReadAction(postId: string) {
  const userId = await requireAuthenticatedUser()
  // The navigation lives in the layout, which a client navigation to the Post keeps; only
  // a refresh re-renders its badge.
  if (await markPostRead(userId, postId)) refresh()
}
