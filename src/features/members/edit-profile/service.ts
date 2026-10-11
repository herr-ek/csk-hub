import "server-only"

import { listVoiceCapabilities, setVoiceCapabilities } from "@/features/voice"
import { isVoiceDivision, VOICE_DIVISIONS } from "@/features/voice/model"
import { InactiveViewerError, type MemberDatabase, requireActiveViewer } from "../service"
import type { EditProfileState } from "./state"

export async function getOwnVoiceCapabilities(database: MemberDatabase, userId: string) {
  await requireActiveViewer(database, userId)
  return listVoiceCapabilities(database, userId)
}

export type ProfileEditorActor = { userId: string; impersonating: boolean }

/** The actor comes from authentication, never from the submitted profile form. */
export async function saveOwnVoiceCapabilities(
  database: MemberDatabase,
  actor: ProfileEditorActor | null,
  input: unknown
): Promise<EditProfileState> {
  if (!actor) return { status: "error", error: "sign-in-required" }
  if (actor.impersonating) return { status: "error", error: "impersonation-unavailable" }
  if (!Array.isArray(input) || input.length > VOICE_DIVISIONS.length || !input.every(isVoiceDivision)) {
    return { status: "error", error: "invalid-voices" }
  }
  const voices = VOICE_DIVISIONS.filter((voice) => input.includes(voice))
  try {
    return await database.transaction(async (tx) => {
      // Coordinate with deactivation so an inactive account cannot submit a stale edit form.
      await requireActiveViewer(tx, actor.userId, true)
      const result = await setVoiceCapabilities(tx, actor.userId, voices)
      if (!result.success) return { status: "error", error: "invalid-voices" }
      return { status: "success", voices }
    })
  } catch (error) {
    if (error instanceof InactiveViewerError) return { status: "error", error: "inactive-user" }
    throw error
  }
}
