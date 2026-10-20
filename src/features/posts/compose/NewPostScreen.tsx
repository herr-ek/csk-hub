import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { ROUTES } from "@/core/navigation/site"
import { ContentPage } from "@/shared/layouts/content-page"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { createPost } from "./actions"
import { PostForm } from "./PostForm"

async function ComposeHeader() {
  const t = await getTranslations("Posts")

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">{t("writePost")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("composeDescription")}</p>
    </div>
  )
}

async function ComposeForm() {
  await requirePermission({ action: "post.create" })
  return (
    <PostForm action={createPost} stage="draft" unsaved={{ slot: "new", version: "new" }} cancelHref={ROUTES.news} />
  )
}

export function NewPostScreen() {
  return (
    <ContentPage fill>
      <PageBreadcrumb route="newsCompose" />
      <ComposeHeader />
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ComposeForm />
      </Suspense>
    </ContentPage>
  )
}
