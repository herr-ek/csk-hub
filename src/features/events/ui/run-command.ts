import "server-only"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { AUTHORIZATION_DENIED, requirePermission } from "@/core/authz"
import { type Database, db } from "@/core/db"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName } from "@/shared/errors"
import { withEventPermission } from "../access"
import type { EventResult } from "../model"
import type { EventCommandState } from "./command-state"

/**
 * Require active identity, validate input, then check the exact Event policy in its write
 * transaction. Location commands require Admin-only event.administer. Domain commands remain independent
 * of request sessions for transactional composition and operational use.
 */
export async function runEventsCommand<Schema extends z.ZodType, T>(
  name: string,
  schema: Schema,
  values: unknown,
  command: (input: z.infer<Schema>, actorId: string, database: Database) => Promise<EventResult<T>>,
  permission?: (input: z.infer<Schema>) => {
    action: "event.create" | "event.update" | "event.changeStatus" | "event.delete"
    eventId: string | null
    proposed?: { organiserGroupId: string | null }
  }
): Promise<{ state: EventCommandState; data?: T }> {
  const { userId } = await requirePermission({ action: permission ? "app.access" : "event.administer" })

  const input = schema.safeParse(values)
  if (!input.success) return { state: { status: "error", error: "invalid-input" } }

  let result: EventResult<T>
  try {
    const request = permission?.(input.data)
    result = request
      ? await withEventPermission(request.action, request.eventId, request.proposed, (database, actorId) =>
          command(input.data, actorId, database)
        )
      : await command(input.data, userId, db)
  } catch (error) {
    if (getErrorCode(error) === AUTHORIZATION_DENIED) return { state: { status: "error", error: "access-denied" } }
    logger.error(`admin.events.${name}-failed`, {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error)
    })
    return { state: { status: "error", error: "unexpected" } }
  }
  if (!result.success) return { state: { status: "error", error: result.error } }

  revalidatePath(ROUTES.adminEvents, "layout")
  revalidatePath(ROUTES.events, "layout")
  return { state: { status: "success", completedAt: Date.now() }, data: result.data }
}
