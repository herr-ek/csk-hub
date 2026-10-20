import "server-only"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import {
  type AuthorizationDatabase,
  AuthorizationDeniedError,
  type PermissionRequest,
  requirePermission
} from "@/core/authz"
import { db } from "@/core/db"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import { getErrorCode, getErrorName } from "@/shared/errors"
import type { OrgStructureResult } from "../model"
import type { GroupCommandState } from "./command-state"

/**
 * The common shape of every admin groups Server Action: authorize the Admin, validate the form,
 * run one module command, and pass its typed result through. Non-Admins are refused by
 * explicit application policies, exactly as on the other admin routes.
 */
export async function runGroupCommand<Schema extends z.ZodType>(
  name: string,
  schema: Schema,
  values: Record<string, unknown>,
  command: (input: z.infer<Schema>, tx: AuthorizationDatabase) => Promise<OrgStructureResult<unknown>>
): Promise<GroupCommandState> {
  await requirePermission({ action: "org.manage" })

  const input = schema.safeParse(values)
  if (!input.success) return { status: "error", error: "invalid-input" }

  let result: OrgStructureResult<unknown>
  try {
    result = await db.transaction(async (tx) => {
      const groupId = (input.data as { groupId?: string }).groupId
      const action = ["assign-holder", "end-holding"].includes(name)
        ? "group.managePositions"
        : "group.manageMemberships"
      const permission: PermissionRequest =
        groupId && ["add-member", "end-membership", "change-voice", "assign-holder", "end-holding"].includes(name)
          ? { action, groupId }
          : { action: "org.manage" }
      await requirePermission(permission, tx)
      return command(input.data, tx)
    })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) throw error
    logger.error(`admin.org-structure.${name}-failed`, {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error)
    })
    return { status: "error", error: "unexpected" }
  }
  if (!result.success) return { status: "error", error: result.error }

  revalidatePath(ROUTES.adminOrgStructure, "layout")
  return { status: "success", completedAt: Date.now() }
}
