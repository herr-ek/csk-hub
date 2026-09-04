import { hasAdminRole } from "@/shared/roles"

/** All a publishing decision knows about a Member today. */
export type PublishingMember = { role?: string | null }

/**
 * The one seam that decides who may publish a Post. Today it means Admin.
 *
 * Callers must never inspect the role themselves: widening publishing rights —
 * to the board, to a gig group — has to stay a change to this function alone.
 */
export function canPublishPost(member: PublishingMember | null | undefined): boolean {
  return hasAdminRole(member?.role)
}
