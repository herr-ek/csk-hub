import { getRequestSession } from "@/core/auth/session.server"
import { PostBadgeExpiry } from "./PostBadgeExpiry"
import { nextUnreadPostChangeAt } from "./service"

/** Refreshes unread counts when a Post enters or leaves the unread horizon. */
export async function PostUnreadExpiry() {
  const session = await getRequestSession()
  if (!session) return null
  return <PostBadgeExpiry at={await nextUnreadPostChangeAt(session.user.id)} />
}
