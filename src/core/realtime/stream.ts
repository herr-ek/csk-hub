import "server-only"

import { and, eq } from "drizzle-orm"
import { env } from "@/core/config/env"
import { db } from "@/core/db"
import { activityDelivery } from "@/core/db/schema/activity"
import { activityStreamKey, connectActivityBroker } from "@/core/realtime/broker"
import { type ActivityEvent, isStreamCursor } from "@/core/realtime/events"
import { getActivitySession, isActivitySessionActive } from "./access"
import { type ActivityDeliveryPolicy, isDeliveryAllowed } from "./delivery-access"

function unavailableStream() {
  // A non-200 response can permanently close EventSource. A valid stream followed
  // by EOF preserves its cursor and asks the browser to reconnect after five seconds.
  return new Response("retry: 5000\nevent: unavailable\ndata: {}\n\n", {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no"
    }
  })
}

/** Streams only the authenticated User's activity; channel selection never comes from the browser. */
export async function handleActivityStream(policy: ActivityDeliveryPolicy, request: Request) {
  if (!env.REDIS_URL) return new Response(null, { status: 204 })
  const identity = await getActivitySession()
  if (!identity) return new Response(null, { status: 204 })
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 })
  let broker: Awaited<ReturnType<typeof connectActivityBroker>>
  try {
    broker = await connectActivityBroker()
  } catch {
    return unavailableStream()
  }
  const key = activityStreamKey(identity.userId)
  const requestedCursor = request.headers.get("last-event-id")
  let cursor: string
  try {
    const tail = await broker.withCommandOptions({ timeout: 2_000 }).xRevRange(key, "+", "-", { COUNT: 1 })
    const latest = tail?.[0]?.id ?? "0-0"
    // Future or invalid cursors must not strand a subscriber after broker reset or forgery.
    const compare = (value: string) => value.split("-").map(BigInt)
    const [lastTime, lastCount] = compare(latest)
    const [requestTime, requestCount] = compare(isStreamCursor(requestedCursor) ? requestedCursor : latest)
    cursor =
      requestTime < lastTime || (requestTime === lastTime && requestCount <= lastCount)
        ? isStreamCursor(requestedCursor)
          ? requestedCursor
          : latest
        : latest
  } catch {
    broker.destroy()
    return unavailableStream()
  }
  const encoder = new TextEncoder()
  let stopped = false
  let stopTimer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    stopped = true
    clearTimeout(stopTimer)
    if (broker.isOpen) broker.destroy()
  }
  const stream = new ReadableStream<Uint8Array>(
    {
      async start(controller) {
        const write = (text: string) => {
          if (!stopped) controller.enqueue(encoder.encode(text))
        }
        request.signal.addEventListener("abort", stop, { once: true })
        stopTimer = setTimeout(stop, 240_000)
        try {
          write(`retry: 3000\nid: ${cursor}\nevent: ready\ndata: {}\n\n`)
          while (!stopped) {
            if (!(await isActivitySessionActive(identity))) {
              write("event: unauthorized\ndata: {}\n\n")
              break
            }
            const entries = await broker
              .withCommandOptions({ timeout: 20_000 })
              .xRead({ key, id: cursor }, { BLOCK: 15_000, COUNT: 50 })
            if (stopped) break
            if (entries && !(await isActivitySessionActive(identity))) break
            for (const entry of entries?.[0]?.messages ?? []) {
              cursor = entry.id
              const id = entry.message.delivery
              if (typeof id !== "string" || !/^[\da-f-]{36}$/.test(id)) continue
              const [delivery] = await db
                .select()
                .from(activityDelivery)
                .where(and(eq(activityDelivery.id, id), eq(activityDelivery.userId, identity.userId)))
              if (!delivery || !(await isDeliveryAllowed(policy, delivery))) continue
              const event: ActivityEvent = {
                ...delivery.change,
                id: delivery.id,
                notify: Boolean(delivery.body && !delivery.acknowledgedAt && !delivery.pushCompletedAt),
                ...(delivery.href ? { href: delivery.href } : {}),
                ...(delivery.change.kind === "notification.created" && delivery.body ? { body: delivery.body } : {})
              }
              write(`id: ${cursor}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`)
              if ((controller.desiredSize ?? 0) < -64_000) {
                stop()
                break
              }
            }
            write(`id: ${cursor}\n: heartbeat\n\n`)
          }
        } catch {
          /* Disconnects and Redis failures reconnect through EventSource. */
        } finally {
          request.signal.removeEventListener("abort", stop)
          stop()
          try {
            controller.close()
          } catch {
            /* Browser cancelled. */
          }
        }
      },
      cancel: stop
    },
    { highWaterMark: 64_000, size: (chunk) => chunk?.byteLength ?? 0 }
  )
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff"
    }
  })
}
