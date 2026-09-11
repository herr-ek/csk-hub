import { getTranslations } from "@/core/i18n/server"
import { ContentPage } from "@/shared/layouts/content-page"
import { PublishPostForm } from "./publish-post-form"

/**
 * The screen for publishing a post. It contains the form and some explanatory text.
 */
export async function PublishPostScreen() {
  const t = await getTranslations("Posts")
  return (
    <ContentPage>
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("writePost")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("publishDescription")}</p>
      </div>
      <PublishPostForm />
    </ContentPage>
  )
}
