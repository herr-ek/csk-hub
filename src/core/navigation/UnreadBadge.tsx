import { Suspense } from "react"
import { getRequestSession } from "@/core/auth/session.server"
import { getTranslations } from "@/core/i18n/server"
import { Badge } from "@/shared/ui/base/badge"
import type { UnreadCount } from "./unread-sources"

type UnreadBadgeProps = {
  /** The destination's unread count; without one the badge renders nothing. */
  count: UnreadCount | undefined
  /** `secondary` for placing the badge on a primary-coloured control. */
  variant?: "default" | "secondary"
}

async function UnreadCountBadge({ count, variant }: UnreadBadgeProps) {
  if (!count) return null
  const session = await getRequestSession()
  if (!session) return null

  const [unread, t] = await Promise.all([count(session.user.id), getTranslations("Navigation")])
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
 * The signed-in User's unread count at a destination, for placing inside a link to it.
 * Renders nothing when the destination has no count, when there is nothing unread,
 * while loading, or without a session.
 */
export function UnreadBadge(props: UnreadBadgeProps) {
  return (
    <Suspense fallback={null}>
      <UnreadCountBadge {...props} />
    </Suspense>
  )
}

type UnreadIndicatorProps = {
  /** Every destination's unread count. */
  counts: UnreadCount[]
}

async function AnyUnreadDot({ counts: sources }: UnreadIndicatorProps) {
  const session = await getRequestSession()
  if (!session) return null

  const [counts, t] = await Promise.all([
    Promise.all(sources.map((count) => count(session.user.id))),
    getTranslations("Navigation")
  ])
  if (!counts.some((unread) => unread > 0)) return null

  return (
    <>
      <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
      <span className="sr-only">{t("unreadIndicator")}</span>
    </>
  )
}

/**
 * A dot for a control that hides the navigation links, such as the mobile menu button,
 * shown while anything at any destination is unread. Position the control `relative`.
 */
export function UnreadIndicator(props: UnreadIndicatorProps) {
  return (
    <Suspense fallback={null}>
      <AnyUnreadDot {...props} />
    </Suspense>
  )
}
