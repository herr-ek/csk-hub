"use server"

import { revalidatePath } from "next/cache"
import { AuthorizationDeniedError, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { logger } from "@/core/logging"
import { getErrorCode, getErrorName, getErrorStatus } from "@/shared/errors"
import { saveOwnVoiceCapabilities } from "./service"
import type { EditProfileState } from "./state"

export async function saveProfileAction(_state: EditProfileState, formData: FormData): Promise<EditProfileState> {
  try {
    const current = await requirePermission({ action: "app.access" })
    const actor = { userId: current.userId, impersonating: Boolean(current.impersonatedBy) }
    const result = await saveOwnVoiceCapabilities(db, actor, formData.getAll("voices"))
    if (result.status === "success" && actor) {
      revalidatePath("/[locale]/(app)/me", "page")
      revalidatePath("/[locale]/(app)/me/edit", "page")
      revalidatePath("/[locale]/(app)/members/[memberId]", "page")
    }
    return result
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return { status: "error", error: "sign-in-required" }
    logger.error("members.profile.save-failed", {
      errorCode: getErrorCode(error),
      errorName: getErrorName(error),
      status: getErrorStatus(error)
    })
    return { status: "error", error: "unexpected" }
  }
}
