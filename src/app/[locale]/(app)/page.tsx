import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { UnreadPostsBadge } from "@/features/posts"
import { buttonVariants } from "@/shared/ui/base/button"

export default async function Home() {
  const t = await getTranslations("HomePage")
  const info = await getTranslations("Public.info")

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Link href={ROUTES.news} className={buttonVariants()}>
        {t("readNews")}
        <UnreadPostsBadge variant="secondary" />
      </Link>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <Link href={ROUTES.privacy} className="underline underline-offset-4">
          {info("privacyTitle")}
        </Link>
        <Link href={ROUTES.support} className="underline underline-offset-4">
          {info("supportTitle")}
        </Link>
      </div>
    </main>
  )
}
