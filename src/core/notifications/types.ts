export type NotificationSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
  userAgent?: string | null
  deviceLabel?: string | null
}

export type NotificationDeliveryResult = { success: true } | { success: false; error: string }
