import Link from "next/link"
import { ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui/base/empty"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { canCurrentMemberPublishPost } from "./permissions.server"
import { PublishPostForm } from "./publish-post-form"

function ComposeLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
}

export async function PublishPostScreen() {
  if (!(await canCurrentMemberPublishPost())) {
    return (
      <ComposeLayout>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>You cannot publish posts</EmptyTitle>
            <EmptyDescription>Posts are written by admins. You can still read everything at News.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href={ROUTES.news} className={buttonVariants({ variant: "outline" })}>
              Back to news
            </Link>
          </EmptyContent>
        </Empty>
      </ComposeLayout>
    )
  }

  return (
    <ComposeLayout>
      <div>
        <h1 className="font-heading text-2xl font-semibold">Write a post</h1>
        <p className="mt-1 text-sm text-muted-foreground">Publishing shows the post to every member right away.</p>
      </div>
      <PublishPostForm />
    </ComposeLayout>
  )
}

export function PublishPostScreenSkeleton() {
  return (
    <ComposeLayout>
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="mt-6 h-9 w-full" />
        <Skeleton className="mt-3 h-56 w-full" />
      </div>
    </ComposeLayout>
  )
}
