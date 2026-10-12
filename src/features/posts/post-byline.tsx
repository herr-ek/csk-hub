import { useTranslations } from "@/core/i18n/translations"
import { PostTime } from "./PostTime"

export function PostByline({
  authorName,
  publishedAt,
  editedAt
}: {
  authorName: string | null
  publishedAt: Date
  editedAt: Date | null
}) {
  const t = useTranslations("Posts")
  return (
    <>
      {authorName ?? t("formerMember")} {t("bylineSeparator")} <PostTime date={publishedAt} />
      {/* A reader who saw the Post before must be able to tell it has changed since. */}
      {editedAt ? (
        <>
          {" "}
          {t("bylineSeparator")} {t("edited")} <PostTime date={editedAt} withTime />
        </>
      ) : null}
    </>
  )
}
