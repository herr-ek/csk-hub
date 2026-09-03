import Link from "next/link"
import { newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/base/empty"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { canCurrentMemberPublishPost } from "./permissions.server"
import { PublishedAt } from "./published-at"
import { listNewsFeed } from "./service"

function NewsHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">News</h1>
        <p className="mt-1 text-sm text-muted-foreground">What is happening in the choir.</p>
      </div>
      {children}
    </div>
  )
}

export async function NewsScreen() {
  const [entries, canPublish] = await Promise.all([listNewsFeed(), canCurrentMemberPublishPost()])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <NewsHeader>
        {canPublish ? (
          <Link href={ROUTES.newsCompose} className={buttonVariants()}>
            Write a post
          </Link>
        ) : null}
      </NewsHeader>

      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing posted yet</EmptyTitle>
            <EmptyDescription>Posts from the board will show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link href={newsPostPath(entry.id)} className="group block focus-visible:outline-none">
                <Card className="transition-colors group-hover:bg-muted/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  <CardHeader>
                    <CardTitle className="text-lg break-words">{entry.title}</CardTitle>
                    <CardDescription>
                      {entry.authorName} · <PublishedAt date={entry.publishedAt} />
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export function NewsScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <NewsHeader />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <CardHeader className="gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  )
}
