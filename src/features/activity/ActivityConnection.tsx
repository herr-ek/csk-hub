"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { parseSafeInternalPath } from "@/core/navigation/navigation-utils"
import { type ActivityEvent, activityEventSchema } from "@/core/realtime/events"
import { toast } from "@/shared/ui/base/toast"

/** One SSE connection for this session. Hidden clients never acknowledge notifications. */
export function ActivityConnection({ userId }: { userId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations("Realtime")
  const translate = useRef(t)
  translate.current = t
  const [pending, startTransition] = useTransition()
  const route = useRef({ pathname, older: searchParams.has("before") })
  route.current = { pathname, older: searchParams.has("before") }
  const refreshing = useRef(pending)
  refreshing.current = pending

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    const deferred = new Map<string, ActivityEvent>()
    const seen = new Set<string>()
    const source = new EventSource("/api/realtime/events")

    const refresh = () => {
      dirty = true
      if (timer) return
      const run = () => {
        timer = undefined
        if (disposed || document.visibilityState !== "visible") return
        if (refreshing.current) {
          timer = setTimeout(run, 150)
          return
        }
        if (dirty) {
          dirty = false
          startTransition(() => router.refresh())
        }
      }
      timer = setTimeout(run, 100)
    }

    const present = async (event: ActivityEvent) => {
      if (!event.notify || document.visibilityState !== "visible" || disposed) return
      const href = parseSafeInternalPath(event.href)
      // The signed read marker acknowledges only after the refreshed timeline renders.
      if (event.kind === "message.created" && href === route.current.pathname && !route.current.older) return
      const key = `csk-activity:${userId}:${event.id}`
      const show = async () => {
        if (disposed || document.visibilityState !== "visible") return
        let alreadyShown = false
        try {
          alreadyShown = localStorage.getItem(key) !== null
        } catch {
          /* Storage can be disabled. */
        }
        if (!alreadyShown) {
          toast.add({
            id: event.id,
            title: translate.current(event.kind === "message.created" ? "newMessage" : "notification"),
            description: event.body,
            ...(href ? { actionProps: { children: translate.current("open"), onClick: () => router.push(href) } } : {})
          })
          try {
            localStorage.setItem(key, String(Date.now()))
          } catch {
            /* Best-effort cross-tab deduplication. */
          }
        }
        await fetch("/api/realtime/ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: event.id }),
          keepalive: true
        }).catch(() => undefined)
      }
      if (navigator.locks) await navigator.locks.request(key, show)
      else await show()
    }

    const receive = (message: MessageEvent<string>) => {
      try {
        const parsed = activityEventSchema.safeParse(JSON.parse(message.data))
        if (!parsed.success || seen.has(parsed.data.id)) return
        const event = parsed.data
        seen.add(event.id)
        if (seen.size > 2_000) seen.delete(seen.values().next().value ?? "")
        if (document.visibilityState !== "visible") {
          if (event.notify && deferred.size < 100) deferred.set(event.id, event)
          dirty = true
          return
        }
        void present(event)
        refresh()
      } catch {
        /* Malformed transport data does not mutate UI or acknowledge anything. */
      }
    }
    const resume = () => {
      if (document.visibilityState !== "visible") return
      for (const event of deferred.values()) void present(event)
      deferred.clear()
      refresh()
    }
    const unauthorized = () => {
      source.close()
      refresh()
    }
    source.addEventListener("activity", receive as EventListener)
    source.addEventListener("ready", refresh)
    source.addEventListener("unauthorized", unauthorized)
    window.addEventListener("online", resume)
    window.addEventListener("focus", resume)
    document.addEventListener("visibilitychange", resume)
    // Keep deduplication storage bounded to the delivery retention period.
    try {
      for (const key of Object.keys(localStorage)) {
        if (
          key.startsWith(`csk-activity:${userId}:`) &&
          Number(localStorage.getItem(key)) < Date.now() - 7 * 86_400_000
        )
          localStorage.removeItem(key)
      }
    } catch {
      /* Optional storage. */
    }
    return () => {
      disposed = true
      source.close()
      clearTimeout(timer)
      window.removeEventListener("online", resume)
      window.removeEventListener("focus", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [router, userId])

  return null
}
