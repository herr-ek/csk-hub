/**
 * The feed's query flag confirming an unpublish. The action has to leave the Post by redirect,
 * since its permalink stops working, so the confirmation travels with the destination. Its
 * value says whose drafts the Post went back to: the User's own, or another author's.
 */
export const UNPUBLISHED_NOTICE_PARAM = "unpublished"

export type UnpublishedTo = "own" | "author"

export function isUnpublishedTo(value: string | null): value is UnpublishedTo {
  return value === "own" || value === "author"
}
