import { ContentPage } from "@/shared/layouts/content-page"
import { PublishPostForm } from "./publish-post-form"

/**
 * Reaching this screen already means the route allowed it — `/news/new` is gated on the
 * `post: create` permission before the page renders. The action re-checks anyway, so a
 * hand-rolled POST is refused on its own merits rather than on having found the page.
 */
export function PublishPostScreen() {
  return (
    <ContentPage>
      <div>
        <h1 className="font-heading text-2xl font-semibold">Write a post</h1>
        <p className="mt-1 text-sm text-muted-foreground">Publishing shows the post to every member right away.</p>
      </div>
      <PublishPostForm />
    </ContentPage>
  )
}
