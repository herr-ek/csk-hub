"use server"

import { refresh, revalidatePath } from "next/cache"
import { getRequestSession } from "@/core/auth/session.server"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { markPostRead } from "./service"

/**
 * Marks the Post read for the signed-in User, then refreshes the unread badges. Does nothing
 * while an Admin impersonates the User: support looking at a Post must not take it off the
 * User's own unread list.
 */
export async function markPostReadAction(postId: string) {
  try {
    const session = await getRequestSession()
    if (!session || session.session.impersonatedBy) return

    if (!(await markPostRead(session.user.id, postId))) return
  } catch (error) {
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
  refresh()
}
