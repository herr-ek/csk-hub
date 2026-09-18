import Link from "next/link"
import { Fragment } from "react"
import { getFormatter, getTimeZone, getTranslations } from "@/core/i18n/server"
import { Message, MessageContent, MessageGroup } from "@/shared/ui/base/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from "@/shared/ui/base/message-scroller"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { formatMessageSentAt } from "../shared/message-timestamp"
import { MessageComposer } from "./message-composer"
import { getDirectConversationPage } from "./query"
import { ReadMarker } from "./read-marker"
import { getDirectMessageLayout } from "./timeline-layout"
import { createMessageCalendarDayKey, formatMessageDay, formatMessageTime } from "./timestamp"

export async function ConversationScreen({
  conversationId,
  beforeSequence
}: {
  conversationId: string
  beforeSequence?: number
}) {
  const [conversation, t, format, timeZone] = await Promise.all([
    getDirectConversationPage(conversationId, beforeSequence),
    getTranslations("Messages"),
    getFormatter(),
    getTimeZone()
  ])
  const layout = getDirectMessageLayout(conversation.messages, createMessageCalendarDayKey(timeZone))
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/messages" className="text-sm text-muted-foreground underline">
          {t("title")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">
          {conversation.otherMemberName ?? t("formerMember")}
        </h1>
        {!conversation.canSend ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("otherMemberInactive")}</p>
        ) : null}
      </div>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="h-[min(60vh,40rem)] rounded-xl border bg-card">
          <MessageScrollerViewport aria-label={t("title")}>
            <MessageScrollerContent className="gap-4 p-4">
              {conversation.nextBeforeSequence ? (
                <Link
                  className="self-center text-sm underline"
                  href={`/messages/${conversationId}?before=${conversation.nextBeforeSequence}`}
                >
                  {t("loadOlder")}
                </Link>
              ) : null}
              <MessageGroup className="gap-0">
                {conversation.messages.map((item, index) => {
                  const itemLayout = layout[index]
                  return (
                    <Fragment key={item.id}>
                      {itemLayout.showsDayDivider ? (
                        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                          <div className="h-px flex-1 bg-border" />
                          <time dateTime={item.sentAt.toISOString()}>{formatMessageDay(format, item.sentAt)}</time>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      ) : null}
                      {itemLayout.showsTimeSeparator ? (
                        <time
                          className="mb-3 mt-6 self-center text-xs text-muted-foreground"
                          dateTime={item.sentAt.toISOString()}
                          title={formatMessageSentAt(format, item.sentAt)}
                        >
                          {formatMessageTime(format, item.sentAt)}
                        </time>
                      ) : null}
                      <MessageScrollerItem
                        messageId={item.id}
                        scrollAnchor={item.sequence === conversation.newestSequence}
                        className={itemLayout.startsNewGroup && !itemLayout.showsTimeSeparator ? "pt-3" : "pt-1"}
                      >
                        <Message align={item.isOwnMessage ? "end" : "start"}>
                          <MessageContent className="w-fit! max-w-[85%]">
                            <div
                              className="w-fit max-w-full self-start rounded-2xl border bg-muted px-3.5 py-2.5 group-data-[align=end]/message:self-end group-data-[align=end]/message:bg-primary group-data-[align=end]/message:text-primary-foreground"
                              title={formatMessageSentAt(format, item.sentAt)}
                            >
                              <p className="whitespace-pre-wrap wrap-break-word">{item.text}</p>
                            </div>
                            <time className="sr-only" dateTime={item.sentAt.toISOString()}>
                              {t("sentAt", { date: formatMessageSentAt(format, item.sentAt) })}
                            </time>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    </Fragment>
                  )
                })}
              </MessageGroup>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
        <ReadMarker
          conversationId={conversationId}
          sequence={conversation.newestSequence}
          token={conversation.readToken}
        />
        <MessageComposer conversationId={conversationId} readOnly={!conversation.canSend} />
      </MessageScrollerProvider>
    </main>
  )
}

export function ConversationScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-3 h-8 w-44" />
      </div>
      <div className="flex h-[min(60vh,40rem)] flex-col justify-end gap-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-16 w-3/4 self-start rounded-2xl" />
        <Skeleton className="h-12 w-2/3 self-end rounded-2xl" />
        <Skeleton className="h-16 w-4/5 self-start rounded-2xl" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
    </main>
  )
}
