import Link from "next/link"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { formatMessageSentAt } from "../message-timestamp"
import { listConversations } from "./query"
import { StartConversationDialog } from "./start-conversation-dialog"

export async function MessagesScreen() {
  const [conversations, t, format] = await Promise.all([
    listConversations(),
    getTranslations("Messages"),
    getFormatter()
  ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <StartConversationDialog />
      </div>
      {conversations.length ? (
        <ol className="grid gap-3" aria-label={t("conversations")}>
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/messages/${conversation.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="wrap-break-word font-medium">{conversation.otherMemberName ?? t("formerMember")}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {conversation.preview ?? t("noMessages")}
                    </p>
                    {!conversation.canSend ? (
                      <p className="mt-1 text-sm text-muted-foreground">{t("readOnly")}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground">
                    <time dateTime={conversation.sentAt.toISOString()}>
                      {formatMessageSentAt(format, conversation.sentAt)}
                    </time>
                    {conversation.unreadCount ? (
                      <p className="mt-1 font-medium text-foreground">
                        {t("unread", { count: conversation.unreadCount })}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      <Link href="/" className="text-sm text-muted-foreground underline">
        {t("backToHome")}
      </Link>
    </main>
  )
}

export function MessagesScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
