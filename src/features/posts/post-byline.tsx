import { useTranslations } from "@/core/i18n/translations"
import { PublishedAt } from "./published-at"

export function PostByline({ authorName, publishedAt }: { authorName: string | null; publishedAt: Date }) {
  const t = useTranslations("Posts")
  return (
    <>
      {authorName ?? t("formerMember")} {t("bylineSeparator")} <PublishedAt date={publishedAt} />
    </>
  )
}
