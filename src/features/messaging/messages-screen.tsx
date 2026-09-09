import Link from "next/link"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Input } from "@/shared/ui/base/input"
import { listDirectConversations } from "./inbox-query"
import { StartConversationComposer } from "./message-composer"
import { searchActiveMembers } from "./service"

function formatSentAt(sentAt: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(sentAt)
}

export async function MessagesScreen({ query }: { query: string }) {
  const [conversations, members] = await Promise.all([
    listDirectConversations(),
    query.trim() ? searchActiveMembers(query) : []
  ])
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your private Conversations.</p>
      </div>
      {conversations.length ? (
        <ol className="grid gap-3" aria-label="Direct Conversations">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/messages/${conversation.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{conversation.otherMemberName}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{conversation.preview}</p>
                    {conversation.readOnly ? (
                      <p className="mt-1 text-sm text-muted-foreground">This Conversation is read-only.</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground">
                    <time dateTime={conversation.sentAt.toISOString()}>{formatSentAt(conversation.sentAt)}</time>
                    {conversation.unreadCount ? (
                      <p className="mt-1 font-medium text-foreground">{conversation.unreadCount} unread</p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No Conversations yet.</p>
      )}
      <div>
        <h2 className="font-heading text-lg font-semibold">Start a Conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Find an active Member to send a private Message.</p>
      </div>
      <form className="flex gap-2">
        <Input
          className="min-w-0 flex-1"
          name="q"
          defaultValue={query}
          placeholder="Search name or username"
          aria-label="Search Members"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {query.trim() && members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active Members match that search.</p>
      ) : null}
      <div className="grid gap-3">
        {members.map((member) => (
          <Card key={member.id} size="sm">
            <CardHeader>
              <CardTitle>{member.name}</CardTitle>
              {member.username ? <CardDescription>@{member.username}</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <StartConversationComposer recipientId={member.id} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Link href="/" className="text-sm text-muted-foreground underline">
        Back to home
      </Link>
    </main>
  )
}
