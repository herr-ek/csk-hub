import { Suspense } from "react"
import { getTranslations } from "@/core/i18n/server"
import { ContentPage } from "@/shared/layouts/content-page"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { PublishPostForm } from "./publish-post-form"

async function ComposeHeader() {
  const t = await getTranslations("Posts")

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">{t("writePost")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("publishDescription")}</p>
    </div>
  )
}

function PostComposerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-10 w-full rounded-b-none" />
        <Skeleton className="h-56 w-full rounded-t-none" />
      </div>
      <Skeleton className="h-9 w-24" />
    </div>
  )
}

export function PublishPostScreen() {
  return (
    <ContentPage fill>
      <ComposeHeader />
      {/*
        Tiptap keys its editor element with `Math.random()`, which a prerender would
        freeze into the build, so the composer is left out of the static shell and
        streamed instead. The boundary is what excludes it; the page itself stays static.
      */}
      <Suspense fallback={<PostComposerSkeleton />}>
        <PublishPostForm />
      </Suspense>
    </ContentPage>
  )
}
