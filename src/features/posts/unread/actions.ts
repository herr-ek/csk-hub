"use server"

import { refresh, revalidatePath } from "next/cache"
import { AuthorizationDeniedError, requirePermission } from "@/core/authz"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { scheduleActivityDispatch } from "@/features/messaging/activity"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { markPostRead } from "./service"

/**
 * Marks the Post read for the signed-in User, then refreshes the unread badges.
 */
export async function markPostReadAction(postId: string) {
  try {
    const actor = await requirePermission({ action: "app.access" })

    if (!(await markPostRead(actor.userId, postId))) return
  } catch (error) {
    // Signed-out or unauthorized readers are expected here, not failures.
    if (error instanceof AuthorizationDeniedError) return
    logger.error("news.post.mark-read-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return
  }

  // The navigation lives in the layout, which a client navigation to the Post keeps; only
  // a refresh re-renders its badge. The feed the User came from is cached by the router,
  // and would still label the Post unread on the way back without being revalidated.
  revalidatePath(ROUTES.news)
  scheduleActivityDispatch()
  refresh()
}
