import "server-only"

import { and, asc, eq, gt, inArray, isNull, lt, lte, min, or, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import { group, positionAppointment } from "@/core/db/schema/org-structure"
import {
  currentOrganisationYear,
  type GroupType,
  type IsoDate,
  organisationYearPeriod,
  POSITION_DEFINITIONS,
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

/** Every Position code whose responsibility context is the given Group type, in catalogue order. */
function positionCodesFor(type: GroupType) {
  return Object.values(PositionCode).filter((code) => POSITION_DEFINITIONS[code].context === type)
}

/** Appointments joined to their holder and context, filtered by `where`, in display order. */
async function selectAppointmentRows(database: OrgStructureDatabase, where: SQL | undefined) {
  const choir = alias(group, "position_overview_choir")
  return database
    .select({ appointment: positionAppointment, name: user.name, context: group, choirName: choir.name })
    .from(positionAppointment)
    .innerJoin(user, eq(user.id, positionAppointment.userId))
    .innerJoin(group, eq(group.id, positionAppointment.contextGroupId))
    .leftJoin(choir, eq(choir.id, group.choirId))
    .where(where)
    .orderBy(asc(positionAppointment.startDate), asc(user.name), asc(positionAppointment.id))
}

type OverviewRow = Awaited<ReturnType<typeof selectAppointmentRows>>[number]
type Holder = { userId: string; name: string; periods: { id: string; startDate: IsoDate; endDate: IsoDate | null }[] }
type Position = { code: PositionCode; holders: Holder[] }
type Context = { group: typeof group.$inferSelect; choirName: string | null; positions: Position[] }

/** Folds appointment rows into contexts, each Position with its holders and their periods. */
function groupRowsByContext(rows: OverviewRow[]) {
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
  return contexts
}

/** Adds every active context, and each catalogue Position it could hold, so vacancies are listed too. */
async function addVacantPositions(database: OrgStructureDatabase, contexts: Map<string, Context>) {
  const choir = alias(group, "position_overview_choir")
  const contextTypes = [...new Set(Object.values(POSITION_DEFINITIONS).map(({ context }) => context))]
  const activeContexts = await database
    .select({ context: group, choirName: choir.name })
    .from(group)
    .leftJoin(choir, eq(choir.id, group.choirId))
    .where(and(eq(group.active, true), inArray(group.type, contextTypes)))
  for (const { context, choirName } of activeContexts)
    if (!contexts.has(context.id)) contexts.set(context.id, { group: context, choirName, positions: [] })
  for (const entry of contexts.values())
    for (const code of positionCodesFor(entry.group.type))
      if (!entry.positions.some((position) => position.code === code)) entry.positions.push({ code, holders: [] })
}

function sortPositions(contexts: Map<string, Context>) {
  const codes = Object.values(PositionCode)
  for (const context of contexts.values())
    context.positions.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code))
  return [...contexts.values()]
}

/**
 * Positions grouped by their actual responsibility context, never duplicated into granted Groups.
 * Without a year, returns every active context with each Position it could hold, including
 * vacant Positions with no holders on `today`. A historical year includes only Positions that
 * had holders, including archived contexts and fluid Positions. The current year's
 * historical view stops at today, so prepared appointments never appear as past holders.
 */
export async function listPositionOverview(database: OrgStructureDatabase, today: IsoDate, year?: number) {
  requireDate(today)
  if (year !== undefined && (!Number.isInteger(year) || year < 1000 || year > currentOrganisationYear(today)))
    throw new RangeError("Position history requires a past or current organisational year.")
  const period = year === undefined ? null : organisationYearPeriod(year)
  const through = period ? (period.endDate <= today ? period.endDate : shiftDate(today, 1)) : shiftDate(today, 1)
  const rows = await selectAppointmentRows(
    database,
    period
      ? and(
          lt(positionAppointment.startDate, through),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, period.startDate))
        )
      : and(
          lte(positionAppointment.startDate, today),
          or(isNull(positionAppointment.endDate), gt(positionAppointment.endDate, today)),
          eq(group.active, true)
        )
  )
  const contexts = groupRowsByContext(rows)
  if (year === undefined) await addVacantPositions(database, contexts)
  return sortPositions(contexts)
}

/**
 * Positions that are already prepared to start after `today`, in active contexts, so people
 * appointed for a future date appear before they take office. Positions without a prepared
 * holder are listed as vacant, matching the current view. Holders' periods show only the
 * tenures that start after `today`.
 */
export async function listFuturePositionOverview(database: OrgStructureDatabase, today: IsoDate) {
  requireDate(today)
  const rows = await selectAppointmentRows(
    database,
    and(gt(positionAppointment.startDate, today), eq(group.active, true))
  )
  const contexts = groupRowsByContext(rows)
  await addVacantPositions(database, contexts)
  return sortPositions(contexts)
}

export type PositionOverview = Awaited<ReturnType<typeof listPositionOverview>>
