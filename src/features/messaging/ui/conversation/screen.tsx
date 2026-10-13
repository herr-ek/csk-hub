import Link from "next/link"
import { notFound } from "next/navigation"
import { Fragment } from "react"
import { getFormatter, getTimeZone, getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
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
import { cn } from "@/shared/utils"
import { MessagingAccessError } from "../../model/messaging-error"
import { formatMessageSentAt } from "../message-timestamp"
import { GroupControls } from "./group-controls"
import { MessageComposer } from "./message-composer"
import { getConversationPage } from "./query"
import { ReadMarker } from "./read-marker"
import { getMessageLayout } from "./timeline-layout"
import { createMessageCalendarDayKey, formatMessageDay, formatMessageTime } from "./timestamp"

/**
 * Below `md` the conversation is a chat screen: it takes the height left under the header (and above the quick-access
 * bar's spacer), the messages scroll in their own pane, and the composer stays pinned at the bottom instead of
 * scrolling under the bar. Without the bar the composer sits at the foot of the screen, just clear of the iPhone home
 * indicator; with it, the bar's spacer already holds that room. From `md` up it is an ordinary page with a fixed-height
 * pane.
 */
const screenClass =
  "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 max-md:[body:has([data-bottom-bar-spacer])_&]:pb-4 md:flex-none md:overflow-visible md:pb-8"
/** Fills the screen's spare height on small screens, but never shrinks below a few lines of messages. */
const paneClass = "min-h-40 flex-1 md:h-[min(60vh,40rem)] md:flex-none"

export async function ConversationScreen({
  conversationId,
  beforeSequence
}: {
  conversationId: string
  beforeSequence?: number
}) {
  const [conversation, t, format, timeZone] = await Promise.all([
    getConversationOrNotFound(conversationId, beforeSequence),
    getTranslations("Messages"),
    getFormatter(),
    getTimeZone()
  ])
  const layout = getMessageLayout(conversation.messages, createMessageCalendarDayKey(timeZone))
  return (
    <main className={screenClass}>
      <div>
        <PageBreadcrumb route="messages" current={conversation.otherMemberName ?? t("formerMember")} />
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="min-w-0 wrap-break-word font-heading text-2xl font-semibold">
            {conversation.otherMemberName ?? t("formerMember")}
          </h1>
          {conversation.kind === "group" && conversation.canSend ? (
            <GroupControls
              conversationId={conversationId}
              name={conversation.otherMemberName}
              members={conversation.members}
            />
          ) : null}
        </div>
        {!conversation.canSend ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t(conversation.kind === "group" ? "leftGroup" : "otherMemberInactive")}
          </p>
        ) : null}
      </div>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className={cn(paneClass, "rounded-xl border bg-card")}>
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
              {!conversation.messages.length ? (
                <p className="text-sm text-muted-foreground">{t("noMessages")}</p>
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
                            {conversation.kind === "group" && itemLayout.startsNewGroup && !item.isOwnMessage ? (
                              <p className="text-xs text-muted-foreground">{item.authorName ?? t("formerMember")}</p>
                            ) : null}
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

async function getConversationOrNotFound(conversationId: string, beforeSequence?: number) {
  try {
    return await getConversationPage(conversationId, beforeSequence)
  } catch (error) {
    if (
      error instanceof MessagingAccessError &&
      (error.kind === "conversation-not-found" || error.kind === "conversation-view-forbidden")
    )
      notFound()
    throw error
  }
}

export function ConversationScreenSkeleton() {
  return (
    <main className={screenClass} aria-busy="true">
      <div>
        <PageBreadcrumb route="messages" current={<Skeleton className="h-4 w-24" />} />
        <Skeleton className="mt-3 h-8 w-44" />
      </div>
      <div className={cn(paneClass, "flex flex-col justify-end gap-3 rounded-xl border bg-card p-4")}>
        <Skeleton className="h-16 w-3/4 self-start rounded-2xl" />
        <Skeleton className="h-12 w-2/3 self-end rounded-2xl" />
        <Skeleton className="h-16 w-4/5 self-start rounded-2xl" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
    </main>
  )
}
