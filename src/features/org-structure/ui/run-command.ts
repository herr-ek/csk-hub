import "server-only"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { requireAdmin } from "@/core/auth/permissions.server"
import { logger } from "@/core/logging"
import { ROUTES } from "@/core/navigation/site"
import type { OrgStructureResult } from "@/core/org-structure"
import { getErrorCode, getErrorName } from "@/shared/errors"
import type { GroupCommandState } from "./command-state"

/**
 * The common shape of every admin groups Server Action: authorize the Admin, validate the form,
 * run one module command, and pass its typed result through. Non-Admins are refused by
 * `requireAdmin`, exactly as on the other admin routes.
 */
export async function runGroupCommand<Schema extends z.ZodType>(
  name: string,
  schema: Schema,
  values: Record<string, unknown>,
  command: (input: z.infer<Schema>) => Promise<OrgStructureResult<unknown>>
): Promise<GroupCommandState> {
  await requireAdmin()

  const input = schema.safeParse(values)
  if (!input.success) return { status: "error", error: "invalid-input" }

  let result: OrgStructureResult<unknown>
  try {
    result = await command(input.data)
  } catch (error) {
    logger.error(`admin.org-structure.${name}-failed`, {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error)
    })
    return { status: "error", error: "unexpected" }
  }
  if (!result.success) return { status: "error", error: result.error }

  revalidatePath(ROUTES.adminOrgStructure, "layout")
  revalidatePath(ROUTES.adminGigGroups, "page")
  revalidatePath(ROUTES.adminPositions, "page")
  revalidatePath("/[locale]/(app)/members", "page")
  revalidatePath("/[locale]/(app)/members/[memberId]", "page")
  revalidatePath("/[locale]/(app)/me", "page")
  revalidatePath("/[locale]/(app)/members/[memberId]/career", "page")
  revalidatePath("/[locale]/(app)/me/career", "page")
  return { status: "success", completedAt: Date.now() }
}
