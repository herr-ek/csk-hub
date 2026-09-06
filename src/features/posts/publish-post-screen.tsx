import { PublishPostForm } from "./publish-post-form"

function ComposeLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
}

/**
 * Reaching this screen already means the route allowed it — `/news/new` is gated on the
 * `post: create` permission before the page renders. The action re-checks anyway, so a
 * hand-rolled POST is refused on its own merits rather than on having found the page.
 */
export function PublishPostScreen() {
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
