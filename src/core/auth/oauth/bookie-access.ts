import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm"
import type { Database } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { positionAppointment } from "@/core/db/schema/org-structure"
import { cskToday, currentOrganisationYear, PositionCode } from "@/core/org-structure"
import { hasAdminRole } from "@/shared/roles"

/**
 * The roles the Bookie access claim group releases for a User. Empty when the User does not
 * qualify, so the caller releases nothing rather than an empty list.
 */
export async function bookieAccessRoles(database: Database, userId: string): Promise<string[]> {
  const [actor] = await database.select({ role: user.role, banned: user.banned }).from(user).where(eq(user.id, userId))
  if (!actor || actor.banned) return []
  if (hasAdminRole(actor.role)) return ["organizer"]

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

  return appointment ? ["organizer"] : []
}
