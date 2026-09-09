import { PublishedAt } from "./published-at"

/** What a Post says instead of a name once its author has been erased. */
const ERASED_AUTHOR = "Former member"

export function PostByline({ authorName, publishedAt }: { authorName: string | null; publishedAt: Date }) {
  return (
    <>
      {authorName ?? ERASED_AUTHOR} · <PublishedAt date={publishedAt} />
    </>
  )
}
