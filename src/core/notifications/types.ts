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

/** What a push notification shows; the title is always the application name. */
export type PushNotification = {
  body: string
  /** A same-origin path opened when the notification is clicked, such as a Post's permalink. */
  url?: string
  /** Collapses repeats: a newer notification with the same tag replaces the older one. Use `<feature>:<id>`. */
  tag?: string
}
