import { Suspense } from "react"
import { AppNavigation } from "@/core/navigation/app-navigation"
import { ActivitySubscription } from "@/features/activity"
import { UnreadMessagesBadge } from "@/features/messaging"
import { UnreadPostsBadge } from "@/features/posts"

export default function AuthenticatedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <Suspense fallback={null}>
        <ActivitySubscription />
      </Suspense>
      <AppNavigation badges={{ news: <UnreadPostsBadge />, messages: <UnreadMessagesBadge /> }} />
      {children}
    </>
  )
}
