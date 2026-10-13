import "server-only"

import { z } from "zod"
import type { NotificationSubscription } from "./types"

const MAX_ENDPOINT_LENGTH = 4096
const MAX_USER_AGENT_LENGTH = 1024
const MAX_DEVICE_LABEL_LENGTH = 120

const EXACT_PUSH_HOSTS = new Set(["fcm.googleapis.com"])
const PUSH_HOST_SUFFIXES = ["push.services.mozilla.com", "push.apple.com", "notify.windows.com"]

/** Raised when subscription data or its endpoint violates the supported push contract. */
export class InvalidNotificationSubscriptionError extends Error {
  constructor() {
    super("Invalid push subscription")
    this.name = "InvalidNotificationSubscriptionError"
  }
}

function isAllowedPushHost(hostname: string) {
  return (
    EXACT_PUSH_HOSTS.has(hostname) ||
    PUSH_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
  )
}

/**
 * Validates an untrusted HTTPS endpoint against supported push providers and
 * returns its canonical URL. The provider decides whether the channel is valid.
 * Throws `InvalidNotificationSubscriptionError` for unsupported or unsafe URLs.
 */
export function parsePushEndpoint(value: unknown) {
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
    !isAllowedPushHost(endpoint.hostname)
  ) {
    throw new InvalidNotificationSubscriptionError()
  }

  return endpoint.href
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

const subscriptionSchema = z.object({
  endpoint: z.string().transform(parsePushEndpoint),
  keys: z.object({
    p256dh: z.string().transform((value) => {
      if (validateKey(value, 65)[0] !== 4) throw new InvalidNotificationSubscriptionError()
      return value
    }),
    auth: z.string().transform((value) => {
      validateKey(value, 16)
      return value
    })
  }),
  expirationTime: z.number().int().min(0).max(8.64e15).nullish(),
  userAgent: z.string().max(MAX_USER_AGENT_LENGTH).nullish(),
  deviceLabel: z.string().max(MAX_DEVICE_LABEL_LENGTH).nullish()
})

/**
 * Parses untrusted subscription data into canonical endpoint/keys and bounded
 * optional metadata. Throws `InvalidNotificationSubscriptionError` for invalid data.
 */
export function parseNotificationSubscription(input: unknown): NotificationSubscription {
  const result = subscriptionSchema.safeParse(input)
  if (!result.success) throw new InvalidNotificationSubscriptionError()
  return result.data
}
