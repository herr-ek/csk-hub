import { Suspense } from "react"
import { requirePermission } from "@/core/authz"
import { NotificationManagementScreen } from "@/features/notification-broadcast"

async function AdminNotifications() {
  await requirePermission({ action: "admin.access" })
  return <NotificationManagementScreen />
}

export default function AdminNotificationsPage() {
  return (
    <Suspense fallback={null}>
      <AdminNotifications />
    </Suspense>
  )
}
