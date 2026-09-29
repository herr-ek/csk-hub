import { getTranslations } from "@/core/i18n/server"
import { ContentPage } from "@/shared/layouts/content-page"
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

export function PublishPostScreen() {
  return (
    <ContentPage fill>
      <ComposeHeader />
      <PublishPostForm />
    </ContentPage>
  )
}
