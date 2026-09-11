import { Suspense } from "react"
import { requireAdmin } from "@/core/auth/permissions.server"
import { NotificationManagementScreen } from "@/features/notification-broadcast"

async function AdminNotifications() {
  await requireAdmin()
  return <NotificationManagementScreen />
}

export default function AdminNotificationsPage() {
  return (
    <Suspense fallback={null}>
      <AdminNotifications />
    </Suspense>
  )
}
