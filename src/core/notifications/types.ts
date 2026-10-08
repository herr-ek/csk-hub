export type NotificationSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
  userAgent?: string | null
  deviceLabel?: string | null
}

export type NotificationDeliveryFailureCategory =
  | "invalidSubscription"
  | "subscriptionGone"
  | "providerRejected"
  | "timeout"
  | "deadline"
  | "transport"
  | "bookkeeping"

export type NotificationDeliveryDiagnostics = {
  accepted: number
  failed: number
  failureCategories: Partial<Record<NotificationDeliveryFailureCategory, number>>
}

export type NotificationDeliveryResult =
  | ({ success: true } & NotificationDeliveryDiagnostics)
  | ({
      success: false
      error: "noActiveSubscriptions" | "noRecipients" | "deliveryFailed"
    } & NotificationDeliveryDiagnostics)
