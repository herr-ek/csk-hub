import "server-only"

import type { NotificationSubscription } from "./types"

const MAX_ENDPOINT_LENGTH = 4096
const MAX_USER_AGENT_LENGTH = 1024
const MAX_DEVICE_LABEL_LENGTH = 120

const EXACT_PUSH_HOSTS = new Set(["fcm.googleapis.com"])
const PUSH_HOST_SUFFIXES = ["push.services.mozilla.com", "push.apple.com"]

export class InvalidNotificationSubscriptionError extends Error {
  constructor() {
    super("Invalid push subscription")
    this.name = "InvalidNotificationSubscriptionError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAllowedPushHost(hostname: string) {
  return (
    EXACT_PUSH_HOSTS.has(hostname) ||
    PUSH_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
  )
}

function validateEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH || value.trim() !== value)
    throw new InvalidNotificationSubscriptionError()

  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    throw new InvalidNotificationSubscriptionError()
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.port !== "" ||
    endpoint.hash !== "" ||
    endpoint.pathname === "/" ||
    !isAllowedPushHost(endpoint.hostname)
  ) {
    throw new InvalidNotificationSubscriptionError()
  }

  return endpoint.href
}

export function normalizePushEndpoint(value: unknown) {
  return validateEndpoint(value)
}

function validateKey(value: unknown, expectedBytes: number) {
  if (
    typeof value !== "string" ||
    value.length !== Math.ceil((expectedBytes * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new InvalidNotificationSubscriptionError()
  }

  const decoded = Buffer.from(value, "base64url")
  if (decoded.length !== expectedBytes || decoded.toString("base64url") !== value)
    throw new InvalidNotificationSubscriptionError()

  return decoded
}

function validateOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return value
  if (typeof value !== "string" || value.length > maxLength) throw new InvalidNotificationSubscriptionError()
  return value
}

export function parseNotificationSubscription(input: unknown): NotificationSubscription {
  if (!isRecord(input) || !isRecord(input.keys)) throw new InvalidNotificationSubscriptionError()

  const p256dh = validateKey(input.keys.p256dh, 65)
  if (p256dh[0] !== 4) throw new InvalidNotificationSubscriptionError()

  const auth = validateKey(input.keys.auth, 16)
  const expirationTime = input.expirationTime
  if (
    expirationTime !== undefined &&
    expirationTime !== null &&
    (typeof expirationTime !== "number" ||
      !Number.isSafeInteger(expirationTime) ||
      expirationTime < 0 ||
      expirationTime > 8.64e15)
  ) {
    throw new InvalidNotificationSubscriptionError()
  }

  const userAgent = validateOptionalText(input.userAgent, MAX_USER_AGENT_LENGTH)
  const deviceLabel = validateOptionalText(input.deviceLabel, MAX_DEVICE_LABEL_LENGTH)

  return {
    endpoint: normalizePushEndpoint(input.endpoint),
    expirationTime,
    keys: { p256dh: p256dh.toString("base64url"), auth: auth.toString("base64url") },
    userAgent,
    deviceLabel
  }
}
