import { and, eq, gt, isNull, lte, or } from "drizzle-orm"
import type { Database } from "@/core/db"
import { oauthClient, user } from "@/core/db/schema/auth"
import { directMembership, group } from "@/core/db/schema/org-structure"
import { cskToday, currentOrganisationYear, GroupType } from "@/core/org-structure"
import { hasAdminRole } from "@/shared/roles"

export const websiteScope = "csk:website"
export const websiteAdminClaim = "https://chalmerssangkor.se/claims/website-admin"
export const identityScopes = ["openid", "profile", "email"]

/** Evaluates website access for the User and client of a validated Hub access token. */
export async function canAccessWebsiteAdmin(database: Database, userId: string, clientId: string) {
  const [client] = await database
    .select({ scopes: oauthClient.scopes, disabled: oauthClient.disabled })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
  if (!client?.scopes?.includes(websiteScope) || client.disabled) return false

  const [actor] = await database.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, userId))
  if (!actor || actor.banned) return false
  if (hasAdminRole(actor.role)) return true

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

  return Boolean(membership)
}
