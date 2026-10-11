import type { VoiceDivision } from "@/features/voice/model"

export type EditProfileState =
  | { status: "idle" }
  | { status: "success"; voices: VoiceDivision[] }
  | {
      status: "error"
      error: "sign-in-required" | "impersonation-unavailable" | "inactive-user" | "invalid-voices" | "unexpected"
    }
