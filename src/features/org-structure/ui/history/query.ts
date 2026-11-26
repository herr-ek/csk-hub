import "server-only"

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { group, section } from "@/core/db/schema/org-structure"
import { cskToday, GroupType, type IsoDate, POSITION_DEFINITIONS } from "@/core/org-structure"
import { listAppointmentsForGroup } from "../../appointments"
import { listDirectMemberships } from "../../direct-membership"
import { yearPhase } from "../../roster"
import { listPeople } from "../../roster-reads"
import { listLocalizedGroupLabels } from "../group-labels"

export type GroupHistory = NonNullable<Awaited<ReturnType<typeof getGroupHistory>>>

/** Everything the history page shows and can correct, or null when the Group does not exist. */
export async function getGroupHistory(groupId: string, today: IsoDate = cskToday()) {
  await requirePermission({ action: "org.manage" })
  const [row] = await db.select().from(group).where(eq(group.id, groupId))
  if (!row) return null
  const labels = await listLocalizedGroupLabels()
  const label = (id: string) => labels.get(id) ?? id

  const [sections, memberships, appointments, sameType, annualGroups, people] = await Promise.all([
    db
      .select({ id: group.id, active: group.active, choirId: group.choirId, voice: section.voice })
      .from(section)
      .innerJoin(group, eq(group.id, section.groupId)),
    listDirectMemberships(db, groupId),
    listAppointmentsForGroup(db, groupId),
    db
      .select({ id: group.id, active: group.active, organisationYear: group.organisationYear })
      .from(group)
      .where(eq(group.type, row.type))
      .orderBy(desc(group.organisationYear), asc(group.name)),
    // The years a Choir's annual Positions can be held in are those of the committees they grant.
    db
      .selectDistinct({ year: group.organisationYear })
      .from(group)
      .where(
        and(
          inArray(group.type, [GroupType.ConcertCommittee, GroupType.GigCommittee]),
          isNotNull(group.organisationYear)
        )
      )
      .orderBy(desc(group.organisationYear)),
    listPeople(db, today)
  ])
  const own = sections.find(({ id }) => id === groupId)

  return {
    group: {
      id: row.id,
      name: label(row.id),
      type: row.type,
      active: row.active,
      organisationYear: row.organisationYear
    },
    sectionVoice: own?.voice ?? null,
    memberships: memberships.map(({ email: _email, ...membership }) => membership),
    appointments: appointments.filter(({ contextGroupId }) => contextGroupId === groupId),
    /** Held elsewhere, with Membership here. */
    granted: appointments
      .filter(({ contextGroupId }) => contextGroupId !== groupId)
      .map((appointment) => ({ ...appointment, contextName: label(appointment.contextGroupId) })),
    /** The Groups a record could belong to instead of this one. */
    contexts: sameType
      .filter(
        ({ active, organisationYear }) =>
          active || (organisationYear !== null && yearPhase(organisationYear, today) === "ended")
      )
      .map(({ id, organisationYear }) => ({ id, organisationYear, name: label(id) })),
    placementSections: own
      ? sections
          .filter(({ choirId }) => choirId === own.choirId)
          .map(({ id, active, voice }) => ({ id, active, voice, name: label(id) }))
          .sort((a, b) => a.name.localeCompare(b.name, "sv"))
      : [],
    years: annualGroups.flatMap(({ year }) => (year === null ? [] : [year])),
    positionCodes: Object.entries(POSITION_DEFINITIONS)
      .filter(([, { context }]) => context === row.type)
      .map(([code]) => code as keyof typeof POSITION_DEFINITIONS),
    people
  }
}
