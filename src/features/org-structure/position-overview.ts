import "server-only"

import { and, asc, eq, gt, isNull, lt, lte, min, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import { group, positionAppointment } from "@/core/db/schema/org-structure"
import {
  currentOrganisationYear,
  type IsoDate,
  organisationYearPeriod,
  PositionCode,
  shiftDate
} from "@/core/org-structure"
import { type OrgStructureDatabase, requireDate } from "./operation"

/** Every organisational year from the earliest started appointment through today's year, newest first. */
export async function listPositionHistoryYears(database: OrgStructureDatabase, today: IsoDate) {
  requireDate(today)
  const [row] = await database
    .select({ first: min(positionAppointment.startDate) })
    .from(positionAppointment)
    .where(lte(positionAppointment.startDate, today))
  const current = currentOrganisationYear(today)
  const first = row?.first ? currentOrganisationYear(row.first) : current
  return Array.from({ length: current - first + 1 }, (_, index) => current - index)
}

/**
 * Positions grouped by their actual responsibility context, never duplicated into granted Groups.
 * Without a year, returns holders on `today` in active contexts. A historical year includes
 * every overlapping tenure, including archived contexts and fluid Positions. The current year's
 * historical view stops at today, so prepared appointments never appear as past holders.
 */
export async function listPositionOverview(database: OrgStructureDatabase, today: IsoDate, year?: number) {
  requireDate(today)
  if (year !== undefined && (!Number.isInteger(year) || year < 1000 || year > currentOrganisationYear(today)))
    throw new RangeError("Position history requires a past or current organisational year.")
  const period = year === undefined ? null : organisationYearPeriod(year)
  const through = period ? (period.endDate <= today ? period.endDate : shiftDate(today, 1)) : shiftDate(today, 1)
  const choir = alias(group, "position_overview_choir")
  const rows = await database
    .select({ appointment: positionAppointment, name: user.name, context: group, choirName: choir.name })
    .from(positionAppointment)
    .innerJoin(user, eq(user.id, positionAppointment.userId))
    .innerJoin(group, eq(group.id, positionAppointment.contextGroupId))
    .leftJoin(choir, eq(choir.id, group.choirId))
    .where(
      and(
        period ? lt(positionAppointment.startDate, through) : lte(positionAppointment.startDate, today),
        or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, period?.startDate ?? today)),
        period ? undefined : eq(group.active, true)
      )
    )
    .orderBy(asc(positionAppointment.startDate), asc(user.name), asc(positionAppointment.id))

  type Holder = { userId: string; name: string; periods: { id: string; startDate: IsoDate; endDate: IsoDate | null }[] }
  type Position = { code: PositionCode; holders: Holder[] }
  type Context = { group: typeof group.$inferSelect; choirName: string | null; positions: Position[] }
  const contexts = new Map<string, Context>()
  for (const { appointment, name, context, choirName } of rows) {
    const entry = contexts.get(context.id) ?? { group: context, choirName, positions: [] }
    contexts.set(context.id, entry)
    let position = entry.positions.find(({ code }) => code === appointment.positionCode)
    if (!position) {
      position = { code: appointment.positionCode, holders: [] }
      entry.positions.push(position)
    }
    let holder = position.holders.find(({ userId }) => userId === appointment.userId)
    if (!holder) {
      holder = { userId: appointment.userId, name, periods: [] }
      position.holders.push(holder)
    }
    holder.periods.push({ id: appointment.id, startDate: appointment.startDate, endDate: appointment.endDate })
  }
  const codes = Object.values(PositionCode)
  for (const context of contexts.values())
    context.positions.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code))
  return [...contexts.values()]
}

export type PositionOverview = Awaited<ReturnType<typeof listPositionOverview>>
