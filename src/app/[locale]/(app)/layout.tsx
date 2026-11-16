import { AppNavigation } from "@/core/navigation/app-navigation"
import type { UnreadSources } from "@/core/navigation/unread-sources"
import { countUnreadConversations } from "@/features/messaging/unread"
import { countUnreadPosts } from "@/features/posts/unread"

/** The features whose unread counts the navigation shows beside their destinations. */
const unreadSources: UnreadSources = { news: countUnreadPosts, messages: countUnreadConversations }

export default function AuthenticatedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <AppNavigation unreadSources={unreadSources} />
      {children}
    </>
  )
}
