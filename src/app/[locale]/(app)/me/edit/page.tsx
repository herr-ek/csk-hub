import { Suspense } from "react"
import { EditProfileScreen, EditProfileSkeleton } from "@/features/members"

export default function EditProfilePage() {
  return (
    <Suspense fallback={<EditProfileSkeleton />}>
      <EditProfileScreen />
    </Suspense>
  )
}
