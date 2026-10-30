import "server-only"

import { createHash } from "node:crypto"
import { createClient } from "redis"
import { env } from "@/core/config/env"
import { logger } from "@/core/logging"

export function activityStreamKey(userId: string) {
  const identity = createHash("sha256").update(userId).digest("hex")
  return `${env.REDIS_KEY_PREFIX}:activity:${identity}`
}

/** Each blocking reader owns its connection; never share it with publishers or other tabs. */
export async function connectActivityBroker() {
  if (!env.REDIS_URL) throw new Error("Realtime is not configured")
  const client = createClient({
    url: env.REDIS_URL,
    socket: { connectTimeout: 2_000, reconnectStrategy: false },
    disableOfflineQueue: true,
    commandsQueueMaxLength: 100
  })
  client.on("error", () => logger.warn("realtime.redis.connection-error"))
  try {
    await client.connect()
    return client
  } catch (error) {
    if (client.isOpen) client.destroy()
    throw error
  }
}

export type ActivityBroker = Awaited<ReturnType<typeof connectActivityBroker>>

/** Bounded, expiring per-User streams. Duplicate publications retain the same delivery identity. */
export async function publishActivity(client: ActivityBroker, userId: string, deliveryId: string) {
  await client
    .withCommandOptions({ timeout: 2_000 })
    .eval(
      "local id = redis.call('XADD', KEYS[1], 'MAXLEN', '~', '1000', '*', 'delivery', ARGV[1]); redis.call('EXPIRE', KEYS[1], 86400); return id",
      { keys: [activityStreamKey(userId)], arguments: [deliveryId] }
    )
}
