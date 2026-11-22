import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import type { Database } from "@/core/db"
import { oauthClient, user } from "@/core/db/schema/auth"
import { positionAppointment } from "@/core/db/schema/org-structure"
import { cskToday, currentOrganisationYear, PositionCode } from "@/core/org-structure"
import { hasAdminRole } from "@/shared/roles"
import { bookieScope } from "./oidc-scopes"

export const bookieOrganizerClaim = "https://chalmerssangkor.se/claims/bookie-organizer"

/** Checks the current Organizer grant for the User and client of a validated Hub access token. */
export async function canAccessBookieOrganizer(database: Database, userId: string, clientId: string) {
  const [client] = await database
    .select({ scopes: oauthClient.scopes, disabled: oauthClient.disabled })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
  if (!client?.scopes?.includes(bookieScope) || client.disabled) return false

  const [actor] = await database.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, userId))
  if (!actor || actor.banned) return false
  if (hasAdminRole(actor.role)) return true

  const today = cskToday()
  const [appointment] = await database
    .select({ id: positionAppointment.id })
    .from(positionAppointment)
    .where(
      and(
        eq(positionAppointment.userId, userId),
        inArray(positionAppointment.positionCode, [PositionCode.FirstConcertMaster, PositionCode.ChoirConcertMaster]),
        eq(positionAppointment.organisationYear, currentOrganisationYear(today)),
        lte(positionAppointment.startDate, today),
        or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, today))
      )
    )
    .limit(1)

  return Boolean(appointment)
}
