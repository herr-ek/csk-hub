import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { conversationPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { OverviewCard, OverviewList, overviewRowClassName } from "@/shared/layouts/overview-card"
import { Badge } from "@/shared/ui/base/badge"
import { listConversations } from "./query"

const SHOWN = 3

/**
 * The viewer's Conversations with unread Messages, latest first, for an overview page. Previews
 * and counts are the inbox's own, so a departed member's cutoff applies here too.
 */
export async function UnreadConversationsCard({ className }: { className?: string }) {
  const [conversations, t] = await Promise.all([listConversations(), getTranslations("HomePage.messages")])
  const unread = conversations.filter((conversation) => conversation.unreadCount > 0)

  return (
    <OverviewCard title={t("title")} link={{ href: ROUTES.messages, label: t("seeAll") }} className={className}>
      {unread.length ? (
        <>
          <p className="text-sm text-muted-foreground">{t("unreadConversations", { count: unread.length })}</p>
          <OverviewList>
            {unread.slice(0, SHOWN).map((conversation) => (
              <li key={conversation.id}>
                <Link href={conversationPath(conversation.id)} className={`${overviewRowClassName} items-center`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{conversation.otherMemberName ?? t("formerMember")}</p>
                    {conversation.preview ? (
                      <p className="truncate text-sm text-muted-foreground">{conversation.preview}</p>
                    ) : null}
                  </div>
                  <Badge aria-label={t("unread", { count: conversation.unreadCount })}>
                    {conversation.unreadCount}
                  </Badge>
                </Link>
              </li>
            ))}
          </OverviewList>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("allRead")}</p>
      )}
    </OverviewCard>
  )
}
