import "server-only"

import { group } from "@/core/db/schema/org-structure"
import { type IsoDate, organisationYearPeriod } from "@/core/org-structure"
import { type OrgStructureDatabase, requireDate } from "./operation"

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
