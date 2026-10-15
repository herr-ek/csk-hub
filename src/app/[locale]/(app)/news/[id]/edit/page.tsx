import { Suspense } from "react"
import { EditPostScreen, EditPostScreenSkeleton } from "@/features/posts"

export default function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<EditPostScreenSkeleton />}>
      {params.then(({ id }) => (
        <EditPostScreen postId={id} />
      ))}
    </Suspense>
  )
}
