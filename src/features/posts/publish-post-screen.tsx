import { ContentPage } from "@/shared/layouts/content-page"
import { PublishPostForm } from "./publish-post-form"

/**
 * The screen for publishing a post. It contains the form and some explanatory text.
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
