import Link from "next/link"
import { Fragment } from "react"
import { Message, MessageContent, MessageGroup } from "@/shared/ui/base/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from "@/shared/ui/base/message-scroller"
import { getDirectMessageLayout } from "./direct-message-layout"
import { MessageComposer } from "./message-composer"
import { ReadMarker } from "./read-marker"
import { getDirectConversation } from "./service"

function formatExactSentAt(sentAt: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(sentAt)
}

function formatDay(sentAt: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(sentAt)
}

function formatTime(sentAt: Date) {
  return new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(sentAt)
}

export async function ConversationScreen({ conversationId, before }: { conversationId: string; before: number[] }) {
  const [conversation, ...olderPages] = await Promise.all([
    getDirectConversation(conversationId),
    ...before.map((cursor) => getDirectConversation(conversationId, cursor))
  ])
  const messages = [...conversation.messages, ...olderPages.flatMap((page) => page.messages)]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((first, second) => first.sequence - second.sequence)
  const olderCursor = olderPages.at(-1)?.olderCursor ?? conversation.olderCursor
  const nextBefore = [...before, olderCursor].join(",")
  const layout = getDirectMessageLayout(messages)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/messages" className="text-sm text-muted-foreground underline">
          Messages
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">{conversation.otherMemberName}</h1>
        {conversation.readOnly ? (
          <p className="mt-1 text-sm text-muted-foreground">The other Member is no longer active.</p>
        ) : null}
      </div>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="h-[min(60vh,40rem)] rounded-xl border bg-card">
          <MessageScrollerViewport aria-label="Messages">
            <MessageScrollerContent className="gap-4 p-4">
              {olderCursor ? (
                <Link
                  className="self-center text-sm underline"
                  href={`/messages/${conversationId}?before=${nextBefore}`}
                >
                  Load older Messages
                </Link>
              ) : null}
              <MessageGroup className="gap-0">
                {messages.map((item, index) => {
                  const itemLayout = layout[index]
                  return (
                    <Fragment key={item.id}>
                      {itemLayout.showsDayDivider ? (
                        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                          <div className="h-px flex-1 bg-border" />
                          <time dateTime={item.sentAt.toISOString()}>{formatDay(item.sentAt)}</time>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      ) : null}
                      {itemLayout.showsTimeSeparator ? (
                        <time
                          className="mb-3 mt-6 self-center text-xs text-muted-foreground"
                          dateTime={item.sentAt.toISOString()}
                          title={formatExactSentAt(item.sentAt)}
                        >
                          {formatTime(item.sentAt)}
                        </time>
                      ) : null}
                      <MessageScrollerItem
                        messageId={item.id}
                        scrollAnchor={item.sequence === conversation.newestSequence}
                        className={itemLayout.startsNewGroup && !itemLayout.showsTimeSeparator ? "pt-3" : "pt-1"}
                      >
                        <Message align={item.isOwnMessage ? "end" : "start"}>
                          <MessageContent className="!w-fit max-w-[85%]">
                            <div
                              className="w-fit max-w-full self-start rounded-2xl border bg-muted px-3.5 py-2.5 group-data-[align=end]/message:self-end group-data-[align=end]/message:bg-primary group-data-[align=end]/message:text-primary-foreground"
                              title={formatExactSentAt(item.sentAt)}
                            >
                              <p className="whitespace-pre-wrap break-words">{item.text}</p>
                            </div>
                            <time className="sr-only" dateTime={item.sentAt.toISOString()}>
                              Sent {formatExactSentAt(item.sentAt)}
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
        <MessageComposer conversationId={conversationId} readOnly={conversation.readOnly} />
      </MessageScrollerProvider>
    </main>
  )
}
