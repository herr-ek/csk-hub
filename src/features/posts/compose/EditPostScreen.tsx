import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { newsPostPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { ContentPage } from "@/shared/layouts/content-page"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PostTime } from "../PostTime"
import { getEditablePost } from "../service"
import { discardDraft, editPublishedPost, saveDraft } from "./actions"
import { ConfirmPostCommand } from "./ConfirmPostCommand"
import { PostForm } from "./PostForm"

export async function EditPostScreen({ postId }: { postId: string }) {
  const post = await getEditablePost(postId)
  // Someone else's draft, and a Post the reader may not change, look like no Post at all.
  if (!post) notFound()

  const t = await getTranslations("Posts")
  const draft = post.state === "draft"

  return (
    <ContentPage fill>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{draft ? t("editDraft") : t("editPublished")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft ? (
              <>
                {t("draftSaved")} <PostTime date={post.savedAt} withTime /> {t("bylineSeparator")}{" "}
                {t("draftDescription")}
              </>
            ) : (
              t("editPublishedDescription")
            )}
          </p>
        </div>
        {draft ? <ConfirmPostCommand command="discard" action={discardDraft.bind(null, post.id)} /> : null}
      </div>
      {/* Keyed on the save, so a reloaded draft starts the editor from what was stored. */}
      <PostForm
        key={post.savedAt.toISOString()}
        action={draft ? saveDraft.bind(null, post.id) : editPublishedPost.bind(null, post.id)}
        stage={post.state}
        initial={post}
        unsaved={{ slot: post.id, version: post.savedAt.toISOString() }}
        cancelHref={draft ? ROUTES.news : newsPostPath(post.id)}
      />
    </ContentPage>
  )
}

export function EditPostScreenSkeleton() {
  return (
    <ContentPage fill busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </ContentPage>
  )
}
