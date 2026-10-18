import "server-only"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { requireAdmin } from "@/core/auth/permissions.server"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName } from "@/shared/errors"
import type { EventResult } from "../model"
import type { EventCommandState } from "./command-state"

/**
 * The common shape of every admin Events Server Action: authorize the Admin, validate the form,
 * run one module command, and pass its typed result through. Non-Admins are refused by
 * `requireAdmin`, exactly as on the other admin routes. On success it hands the command's data
 * to the caller, which may redirect.
 */
export async function runEventsCommand<Schema extends z.ZodType, T>(
  name: string,
  schema: Schema,
  values: unknown,
  command: (input: z.infer<Schema>, actorId: string) => Promise<EventResult<T>>
): Promise<{ state: EventCommandState; data?: T }> {
  const { userId } = await requireAdmin()

  const input = schema.safeParse(values)
  if (!input.success) return { state: { status: "error", error: "invalid-input" } }

  let result: EventResult<T>
  try {
    result = await command(input.data, userId)
  } catch (error) {
    logger.error(`admin.events.${name}-failed`, {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error)
    })
    return { state: { status: "error", error: "unexpected" } }
  }
  if (!result.success) return { state: { status: "error", error: result.error } }

  revalidatePath(ROUTES.adminEvents, "layout")
  return { state: { status: "success", completedAt: Date.now() }, data: result.data }
}
