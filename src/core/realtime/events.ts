import { z } from "zod"

export const activityChangeSchema = z.object({
  kind: z.enum(["message.created", "conversation.changed", "unread.changed", "posts.changed", "notification.created"]),
  conversationId: z.uuid().optional(),
  sequence: z.number().int().positive().optional()
})

export type ActivityChange = z.infer<typeof activityChangeSchema>

export const activityEventSchema = activityChangeSchema.extend({
  id: z.uuid(),
  notify: z.boolean(),
  href: z.string().optional(),
  body: z.string().optional()
})

export type ActivityEvent = z.infer<typeof activityEventSchema>

/** Redis cursors are opaque to callers; accept only bounded stream IDs from browsers. */
export function isStreamCursor(value: string | null): value is string {
  return value !== null && /^\d{1,20}-\d{1,20}$/.test(value)
}
