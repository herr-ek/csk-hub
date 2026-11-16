import type { NotificationDeliveryDiagnostics } from "@/core/notifications/types"

/** A broadcast is queued for later delivery or accepted by push providers; neither guarantees reception. */
export type BroadcastResult =
  | { success: true; delivery: "queued"; queued: number }
  | ({ success: true; delivery: "sent" } & NotificationDeliveryDiagnostics)
  | {
      success: false
      error: "messageRequired" | "userRequired" | "noRecipients" | "noActiveSubscriptions" | "deliveryFailed"
    }
