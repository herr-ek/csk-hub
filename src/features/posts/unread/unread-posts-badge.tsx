import { Suspense } from "react"
import { getRequestSession } from "@/core/auth/session.server"
import { getTranslations } from "@/core/i18n/server"
import { Badge } from "@/shared/ui/base/badge"
import { countUnreadPosts } from "./service"

type UnreadPostsBadgeProps = {
  /** `secondary` for placing the badge on a primary-coloured control. */
  variant?: "default" | "secondary"
}

async function UnreadPostsCount({ variant }: UnreadPostsBadgeProps) {
  const session = await getRequestSession()
  if (!session) return null

  const [unread, t] = await Promise.all([countUnreadPosts(session.user.id), getTranslations("Posts")])
  if (unread === 0) return null

  return (
    <>
      <Badge variant={variant} aria-hidden>
        {unread}
      </Badge>
      <span className="sr-only">{t("unreadCount", { count: unread })}</span>
    </>
  )
}

/**
 * The count of Posts the signed-in User has not seen, for placing inside a link to the
 * News feed. Renders nothing when there are none, while loading, or without a session.
 */
export function UnreadPostsBadge(props: UnreadPostsBadgeProps) {
  return (
    <Suspense fallback={null}>
      <UnreadPostsCount {...props} />
    </Suspense>
  )
}
