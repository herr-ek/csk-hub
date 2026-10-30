import { Suspense } from "react"
import { getRequestSession } from "@/core/auth/session.server"
import { getTranslations } from "@/core/i18n/server"
import { Badge } from "@/shared/ui/base/badge"
import { listConversations } from "./query"

async function Count() {
  const session = await getRequestSession()
  if (!session) return null
  const [conversations, t] = await Promise.all([listConversations(), getTranslations("Messages")])
  const count = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
  return count ? (
    <>
      <Badge aria-hidden>{count}</Badge>
      <span className="sr-only">{t("unread", { count })}</span>
    </>
  ) : null
}

export function UnreadMessagesBadge() {
  return (
    <Suspense fallback={null}>
      <Count />
    </Suspense>
  )
}
