import { NewsPageTransition, PublishPostScreen } from "@/features/posts"

export default function PublishPostPage() {
  return (
    <NewsPageTransition>
      <PublishPostScreen />
    </NewsPageTransition>
  )
}
