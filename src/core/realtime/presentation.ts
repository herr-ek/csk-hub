import type { ActivityEvent } from "./events"

/** A notification is eligible for a toast only before its server-supplied push deadline. */
export function canPresentActivity(event: ActivityEvent, now: number): boolean {
  return event.notify && event.notifyUntil !== undefined && now < event.notifyUntil
}
