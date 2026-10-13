"use server"

import { revalidatePath } from "next/cache"
import { getRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { locales } from "@/core/i18n/locales"
import { memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { saveOwnVoiceCapabilities } from "./service"
import type { EditProfileState } from "./state"

export async function saveProfileAction(_state: EditProfileState, formData: FormData): Promise<EditProfileState> {
  try {
    const session = await getRequestSession()
    const actor = session ? { userId: session.user.id, impersonating: Boolean(session.session.impersonatedBy) } : null
    const result = await saveOwnVoiceCapabilities(db, actor, formData.getAll("voices"))
    if (result.status === "success" && actor) {
      // Revalidation addresses the destination routes of the locale rewrite.
      for (const locale of locales) {
        for (const path of [ROUTES.account, ROUTES.accountEditProfile, memberProfilePath(actor.userId)]) {
          revalidatePath(`/${locale}${path}`)
        }
      }
    }
    return result
  } catch {
    return { status: "error", error: "unexpected" }
  }
}
