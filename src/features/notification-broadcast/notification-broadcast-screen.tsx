import { BroadcastToAllCard } from "./broadcast-to-all-card"
import { SendToSelectedUsersCard } from "./send-to-selected-users-card"

export function NotificationManagementScreen() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Send test push notifications to subscribed members.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <BroadcastToAllCard />
        <SendToSelectedUsersCard />
      </div>
    </main>
  )
}
