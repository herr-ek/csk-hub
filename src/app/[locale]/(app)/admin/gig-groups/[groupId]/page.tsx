import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"
import { requirePermission } from "@/core/authz"
import { GigGroupScreen, GigGroupScreenSkeleton } from "@/features/org-structure"

const groupIdSchema = z.uuid()

export default function AdminGigGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  return (
    <Suspense fallback={<GigGroupScreenSkeleton />}>
      <AdminGigGroup params={params} />
    </Suspense>
  )
}

async function AdminGigGroup({ params }: { params: Promise<{ groupId: string }> }) {
  // Authorize before validating the address, so non-Admins get the same response for any group.
  await requirePermission({ action: "admin.access" })
  const { groupId } = await params
  if (!groupIdSchema.safeParse(groupId).success) notFound()

  return <GigGroupScreen groupId={groupId} />
}
