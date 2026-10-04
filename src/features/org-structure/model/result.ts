/**
 * Why a groups command was refused. Every rule the module enforces, and every constraint the
 * database enforces on its behalf, surfaces as one of these rather than as a thrown error.
 */
export type OrgStructureViolation =
  | "invalid-date"
  | "group-not-found"
  | "group-archived"
  | "group-name-taken"
  | "choir-not-found"
  | "choir-created-with-sections"
  | "section-count"
  | "voice-in-several-sections"
  | "section-archived-with-choir"
  | "already-member"
  | "not-a-member"
  | "section-requires-placement"
  | "voice-not-sung-in-choir"
  | "voice-not-sung-in-section"
  | "already-in-section"
  | "not-a-singer"
  | "same-voice"
  | "position-not-found"
  | "position-name-taken"
  | "position-not-allowed"
  | "position-taken"
  | "not-holding-position"
  | "period-conflict"

export type OrgStructureResult<T> = { success: true; data: T } | { success: false; error: OrgStructureViolation }
