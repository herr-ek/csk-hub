import "server-only"

import { and, eq, lte, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import type { IsoDate, PositionCode } from "@/core/org-structure"
import { appointmentMemberships } from "./appointment-memberships"
import { type OrgStructureDatabase, requireDate } from "./operation"

export type ParticipationHistoryRecord = {
  id: string
  kind: "membership" | "position"
  group: typeof group.$inferSelect
  startDate: IsoDate
  endDate: IsoDate | null
  voice: typeof directMembership.$inferSelect.voice
  positionCode: PositionCode | null
  sourceContextId: string | null
}

/**
 * All started participation through a date, including archived Groups and appointment-derived
 * companion Memberships. Prepared tenures are excluded. An appointment represents its own
 * context Membership where granted, so that connection is not duplicated as another record.
 * The caller must authorize access to the person's history before calling this read.
 */
export async function listParticipationHistoryOfUser(
  database: OrgStructureDatabase,
  userId: string,
  through: IsoDate
): Promise<ParticipationHistoryRecord[]> {
  requireDate(through)
  const inferred = appointmentMemberships(database)
  const context = alias(group, "history_appointment_context")
  const [direct, appointments, granted] = await Promise.all([
    database
      .select({ membership: directMembership, group })
      .from(directMembership)
      .innerJoin(group, eq(group.id, directMembership.groupId))
      .where(and(eq(directMembership.userId, userId), lte(directMembership.startDate, through))),
    database
      .select({ appointment: positionAppointment, group: context })
      .from(positionAppointment)
      .innerJoin(context, eq(context.id, positionAppointment.contextGroupId))
      .where(and(eq(positionAppointment.userId, userId), lte(positionAppointment.startDate, through))),
    database
      .select({ appointment: positionAppointment, group })
      .from(inferred)
      .innerJoin(positionAppointment, eq(positionAppointment.id, inferred.appointmentId))
      .innerJoin(group, eq(group.id, inferred.groupId))
      .where(
        and(
          eq(positionAppointment.userId, userId),
          lte(positionAppointment.startDate, through),
          ne(group.id, positionAppointment.contextGroupId)
        )
      )
  ])
  return [
    ...direct.map(
      ({ membership, group }): ParticipationHistoryRecord => ({
        id: `membership:${membership.id}`,
        kind: "membership",
        group,
        startDate: membership.startDate,
        endDate: membership.endDate,
        voice: membership.voice,
        positionCode: null,
        sourceContextId: null
      })
    ),
    ...appointments.map(
      ({ appointment, group }): ParticipationHistoryRecord => ({
        id: `position:${appointment.id}`,
        kind: "position",
        group,
        startDate: appointment.startDate,
        endDate: appointment.endDate,
        voice: null,
        positionCode: appointment.positionCode,
        sourceContextId: null
      })
    ),
    ...granted.map(
      ({ appointment, group }): ParticipationHistoryRecord => ({
        id: `membership:${appointment.id}:${group.id}`,
        kind: "membership",
        group,
        startDate: appointment.startDate,
        endDate: appointment.endDate,
        voice: null,
        positionCode: appointment.positionCode,
        sourceContextId: appointment.contextGroupId
      })
    )
  ].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
}
