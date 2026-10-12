import { AppNavigation, AppQuickAccessBar } from "@/core/navigation/app-navigation"
import { UnreadPostsBadge } from "@/features/posts"

export default function AuthenticatedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <AppNavigation badges={{ news: <UnreadPostsBadge /> }} />
      {children}
      <AppQuickAccessBar />
    </>
  )
}
