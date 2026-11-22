import { and, eq, gt, isNull, lte, or } from "drizzle-orm"
import type { Database } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { directMembership, group } from "@/core/db/schema/org-structure"
import { cskToday, currentOrganisationYear, GroupType } from "@/core/org-structure"
import { hasAdminRole } from "@/shared/roles"

/**
 * The roles the website access claim group releases for a User. Empty when the User does not
 * qualify, so the caller releases nothing rather than an empty list.
 */
export async function websiteAccessRoles(database: Database, userId: string): Promise<string[]> {
  const [actor] = await database.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, userId))
  if (!actor || actor.banned) return []
  if (hasAdminRole(actor.role)) return ["admin"]

  const today = cskToday()
  // The Position catalogue gives Webmästeriet its membership through Direct Memberships only.
  const [membership] = await database
    .select({ id: directMembership.id })
    .from(directMembership)
    .innerJoin(group, eq(group.id, directMembership.groupId))
    .where(
      and(
        eq(directMembership.userId, userId),
        eq(group.type, GroupType.WebTeam),
        eq(group.organisationYear, currentOrganisationYear(today)),
        lte(directMembership.startDate, today),
        or(isNull(directMembership.endDate), gt(directMembership.endDate, today))
      )
    )
    .limit(1)

  return membership ? ["admin"] : []
}
