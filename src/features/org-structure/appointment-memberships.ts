import "server-only"

import { and, eq, isNull, or, sql } from "drizzle-orm"
import { group, positionAppointment } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, POSITION_DEFINITIONS, type PositionCode } from "@/core/org-structure"
import type { OrgStructureDatabase } from "./operation"

/**
 * Derived appointment-to-Group connections, shared by rosters, profiles and dependency checks.
 * The current catalogue applies to every tenure, including history. Annual targets match the
 * appointment's explicit year; a grant of the context's type targets that exact Group.
 * Archived Groups remain eligible so historical participation survives archiving.
 */
export function appointmentMemberships(database: OrgStructureDatabase) {
  const matches = Object.entries(POSITION_DEFINITIONS).flatMap(([code, definition]) =>
    definition.grants.map((type) =>
      and(
        eq(positionAppointment.positionCode, code as PositionCode),
        eq(group.type, type),
        type === definition.context ? eq(group.id, positionAppointment.contextGroupId) : undefined,
        GROUP_POLICIES[type].lifetime === "annual"
          ? eq(group.organisationYear, positionAppointment.organisationYear)
          : isNull(group.organisationYear)
      )
    )
  )
  return database
    .select({
      appointmentId: sql<string>`${positionAppointment.id}`.as("appointment_id"),
      groupId: sql<string>`${group.id}`.as("group_id")
    })
    .from(positionAppointment)
    .innerJoin(group, or(...matches) ?? sql`false`)
    .as("appointment_memberships")
}
