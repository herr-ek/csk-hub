import { Suspense } from "react"
import { AppNavigation, AppQuickAccessBar } from "@/core/navigation/app-navigation"
import type { UnreadSources } from "@/core/navigation/unread-sources"
import { ActivitySubscription } from "@/core/realtime/ActivitySubscription"
import { countUnreadConversations } from "@/features/messaging/unread"
import { countUnreadPosts, PostUnreadExpiry } from "@/features/posts/unread"

/** The features whose unread counts the navigation shows beside their destinations. */
const unreadSources: UnreadSources = { news: countUnreadPosts, messages: countUnreadConversations }

export default function AuthenticatedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <Suspense fallback={null}>
        <ActivitySubscription />
        <PostUnreadExpiry />
      </Suspense>
      <AppNavigation unreadSources={unreadSources} />
      {children}
      <AppQuickAccessBar />
    </>
  )
}
