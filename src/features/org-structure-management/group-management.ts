import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { appointmentGrant, directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, type GroupType, type IsoDate, organisationYearPeriod } from "@/core/org-structure"
import { createOrganisationGroup } from "./appointments"
import { requireChoirTeamAvailable } from "./group-cardinality"
import { type OrgStructureDatabase, RuleViolation, requireDate, runOrgStructureCommand } from "./operation"

const ANNUAL_GROUP_NAMES: Partial<Record<GroupType, string>> = {
  Board: "Styret",
  Gigmästeri: "Gigmästeriet",
  Sexmästeri: "Sexmästeriet",
  Konsertmästeri: "Konsertmästeriet",
  Rekryteringskommitté: "Rekryteringskommittén",
  Turnékommitté: "Turnékommittén",
  Valberedning: "Valberedningen",
  Webmästeri: "Webmästeriet",
  Arkivarie: "Arkivariet",
  Utantillkommitté: "Utantillkommittén"
}

/** Prepares the required annual set, reusing concrete identities; never copies participation. */
export function prepareOrganisationYear(database: OrgStructureDatabase, year: number) {
  return runOrgStructureCommand(database, async (tx) => {
    if (!Number.isInteger(year) || year < 1000 || year > 9998) throw new RuleViolation("period-conflict")
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`org-structure:year:${year}`}))`)
    const prepared: { id: string; type: GroupType }[] = []
    for (const type of Object.keys(GROUP_POLICIES) as GroupType[]) {
      if (GROUP_POLICIES[type].lifetime !== "annual") continue
      const [existing] = await tx
        .select()
        .from(group)
        .where(and(eq(group.type, type), eq(group.organisationYear, year)))
        .for("share")
      if (existing) {
        if (!existing.active) throw new RuleViolation("group-archived")
        prepared.push({ id: existing.id, type })
      } else {
        const label = ANNUAL_GROUP_NAMES[type] ?? type
        const result = await createOrganisationGroup(tx, {
          name: `${label} ${String(year).slice(-2)}/${String(year + 1).slice(-2)}`,
          type: type as Exclude<GroupType, "Choir" | "Section">,
          organisationYear: year
        })
        if (!result.success) throw new RuleViolation(result.error)
        prepared.push({ id: result.data.id, type })
      }
    }
    return prepared
  })
}

/** Includes history and prepared Groups. Phase is derived from the explicit year at `date`. */
export async function listOrganisationGroups(database: OrgStructureDatabase, date: IsoDate) {
  requireDate(date)
  const rows = await database.select().from(group).orderBy(group.type, group.organisationYear, group.name)
  return rows.map((row) => {
    const bounds = row.organisationYear === null ? null : organisationYearPeriod(row.organisationYear)
    const phase = bounds
      ? date < bounds.startDate
        ? "future"
        : date >= bounds.endDate
          ? "completed"
          : "current"
      : "current"
    return { ...row, phase: phase as "future" | "current" | "completed" }
  })
}

/**
 * Corrects a concrete Group's metadata. Structural changes on occupied Groups are refused
 * atomically: handle participation first. Choirs/Sections keep their reference structure.
 */
export function updateOrganisationGroup(
  database: OrgStructureDatabase,
  input: {
    groupId: string
    name: string
    type: GroupType
    choirId?: string | null
    organisationYear?: number | null
  }
) {
  return runOrgStructureCommand(database, async (tx) => {
    const [current] = await tx.select().from(group).where(eq(group.id, input.groupId)).for("update")
    if (!current) throw new RuleViolation("group-not-found")
    const name = input.name.trim()
    if (!name) throw new RuleViolation("invalid-group-name")
    const choirId = input.choirId ?? null
    const organisationYear = input.organisationYear ?? null
    const structural =
      current.type !== input.type || current.choirId !== choirId || current.organisationYear !== organisationYear
    if (!current.active && structural) throw new RuleViolation("group-archived")
    if (current.type === "Choir" || current.type === "Section" || input.type === "Choir" || input.type === "Section") {
      if (structural) throw new RuleViolation("choir-created-with-sections")
    } else if (structural) {
      const [dependencies] = await tx
        .execute(sql`
        SELECT 1 WHERE EXISTS (${tx.select({ id: directMembership.id }).from(directMembership).where(eq(directMembership.groupId, current.id))})
        OR EXISTS (${tx.select({ id: positionAppointment.id }).from(positionAppointment).where(eq(positionAppointment.contextGroupId, current.id))})
        OR EXISTS (${tx.select({ id: appointmentGrant.appointmentId }).from(appointmentGrant).where(eq(appointmentGrant.groupId, current.id))})
      `)
        .then((result) => result.rows)
      if (dependencies && structural) throw new RuleViolation("group-has-participation")
      const policy = GROUP_POLICIES[input.type]
      if ((policy.scope === "choir") !== Boolean(choirId)) throw new RuleViolation("invalid-group-scope")
      if ((policy.lifetime === "annual") !== (organisationYear !== null)) throw new RuleViolation("period-conflict")
      if (
        organisationYear !== null &&
        (!Number.isInteger(organisationYear) || organisationYear < 1000 || organisationYear > 9998)
      )
        throw new RuleViolation("period-conflict")
      if (choirId) {
        const [choir] = await tx
          .select()
          .from(group)
          .where(and(eq(group.id, choirId), eq(group.type, "Choir"), eq(group.active, true)))
          .for("share")
        if (!choir) throw new RuleViolation("choir-not-found")
      }
    }
    if (current.active && current.type !== "Choir" && current.type !== "Section")
      await requireChoirTeamAvailable(tx, { type: input.type, choirId, exceptGroupId: current.id })
    await tx
      .update(group)
      .set({
        name,
        type: input.type,
        choirId,
        organisationYear
      })
      .where(eq(group.id, current.id))
    return { id: current.id }
  })
}
