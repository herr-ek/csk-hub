import { useTranslations } from "@/core/i18n/translations"
import { PostTime } from "./PostTime"

export function PostByline({
  authorName,
  showAuthor,
  publisherName,
  lastEditorName,
  lastEditorRecorded,
  publishedAt,
  editedAt
}: {
  authorName: string | null
  showAuthor: boolean
  publisherName: string | null
  lastEditorName: string | null
  lastEditorRecorded: boolean
  publishedAt: Date
  editedAt: Date | null
}) {
  const t = useTranslations("Posts")
  const author = authorName ?? t("formerMember")
  return (
    <>
      {publisherName ? (
        <>
          {publisherName}
          {showAuthor ? (
            <>
              {" "}
              {t("bylineSeparator")} {t("postedBy", { name: author })}
            </>
          ) : null}
        </>
      ) : (
        author
      )}{" "}
      {t("bylineSeparator")} <PostTime date={publishedAt} />
      {editedAt ? (
        <>
          {" "}
          {t("bylineSeparator")}{" "}
          {lastEditorRecorded ? t("lastEditedBy", { name: lastEditorName ?? t("formerMember") }) : t("edited")}{" "}
          <PostTime date={editedAt} withTime />
        </>
      ) : null}
    </>
  )
}
