import "server-only"

import { asc, count, desc, eq } from "drizzle-orm"
import { requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { absenceReason, eventResponse } from "@/core/db/schema/events"

export type AbsenceReasonRow = Awaited<ReturnType<typeof listAbsenceReasons>>[number]

/** Every Absence reason, active ones first, with how many Responses give each. */
export async function listAbsenceReasons() {
  await requirePermission({ action: "event.administer" })
  return db
    .select({
      id: absenceReason.id,
      label: absenceReason.label,
      active: absenceReason.active,
      responseCount: count(eventResponse.id)
    })
    .from(absenceReason)
    .leftJoin(eventResponse, eq(eventResponse.absenceReasonId, absenceReason.id))
    .groupBy(absenceReason.id)
    .orderBy(desc(absenceReason.active), asc(absenceReason.label))
}
