import "server-only"

import { and, asc, count, eq, ilike, isNull, ne, or } from "drizzle-orm"
import type { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { timeZone } from "@/core/i18n/time-zone"
import {
  listAppointmentsOfUser,
  listCurrentChoirAffiliationsOfUsers,
  listCurrentGroupsOfUser,
  listCurrentPositionsOfUser,
  listEffectiveChoirAffiliationsOfUsersAt,
  listEffectiveGroupsOfUserAt
} from "@/features/org-structure"
import { POSITION_DEFINITIONS } from "@/features/org-structure/model"
import { listVoiceCapabilities } from "@/features/voice"
import { buildAffiliations } from "./affiliations"

export type MemberDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
export const DIRECTORY_PAGE_SIZE = 24
const activeUser = () => or(eq(user.banned, false), isNull(user.banned))

export class InactiveViewerError extends Error {
  constructor() {
    super("An active User is required to browse members.")
    this.name = "InactiveViewerError"
  }
}

export async function requireActiveViewer(database: MemberDatabase, viewerId: string, lock = false) {
  const query = database
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, viewerId), activeUser()))
    .limit(1)
  const [viewer] = lock ? await query.for("no key update") : await query
  if (!viewer) throw new InactiveViewerError()
}

/** Reads the current database state and returns email only to the profile's owner. */
export async function getMemberProfile(
  database: MemberDatabase,
  viewerId: string,
  memberId: string,
  date: string = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())
) {
  await requireActiveViewer(database, viewerId)
  const [member] = await database
    .select({ id: user.id, name: user.name, username: user.username, image: user.image, email: user.email })
    .from(user)
    .where(and(eq(user.id, memberId), activeUser()))
    .limit(1)
  if (!member) return null
  const [legacyMemberships, legacyHoldings, capabilities, effective, allAppointments] = await Promise.all([
    listCurrentGroupsOfUser(database, memberId),
    listCurrentPositionsOfUser(database, memberId),
    listVoiceCapabilities(database, memberId),
    listEffectiveGroupsOfUserAt(database, memberId, date),
    listAppointmentsOfUser(database, memberId)
  ])
  const modeled = effective
  const memberships = [
    ...legacyMemberships.filter((membership) => !modeled.some((item) => item.groupId === membership.groupId)),
    ...modeled.map((membership) => ({
      ...membership,
      choirName: effective.find((row) => row.groupId === membership.choirId)?.name ?? null
    }))
  ]
  const appointments = allAppointments.filter(
    (appointment) => appointment.startDate <= date && (appointment.endDate === null || appointment.endDate > date)
  )
  const holdings = appointments.map((appointment) => {
    const context = effective.find((membership) => membership.groupId === appointment.contextGroupId)
    const grantIds = effective
      .filter((membership) => membership.sources.some((source) => source.appointmentId === appointment.id))
      .map((membership) => membership.groupId)
    if (effective.some((membership) => membership.groupId === appointment.contextGroupId))
      grantIds.push(appointment.contextGroupId)
    return {
      id: appointment.id,
      positionCode: appointment.positionCode,
      name: POSITION_DEFINITIONS[appointment.positionCode]?.label ?? appointment.positionCode,
      contextGroupId: appointment.contextGroupId,
      contextName: appointment.contextName,
      contextType: appointment.contextType,
      contextChoirName: context?.choirId
        ? (effective.find((membership) => membership.groupId === context.choirId)?.name ?? null)
        : null,
      organisationYear: appointment.organisationYear,
      startDate: appointment.startDate,
      endDate: appointment.endDate,
      groupIds: grantIds
    }
  })
  const legacyByPosition = new Map<string, NonNullable<typeof legacyHoldings>[number]>()
  for (const holding of legacyHoldings) legacyByPosition.set(holding.positionId, holding)
  const legacyPositionSummaries = [...legacyByPosition.values()].flatMap((holding) => {
    const context = legacyMemberships.find((membership) => membership.groupId === holding.groupId)
    return context
      ? [
          {
            id: holding.positionId,
            positionCode: null,
            name: holding.name,
            contextGroupId: holding.groupId,
            contextName: context.name,
            contextType: context.type,
            contextChoirName: context.choirName,
            organisationYear: null,
            startDate: context.startDate,
            endDate: null,
            groupIds: legacyHoldings
              .filter((item) => item.positionId === holding.positionId)
              .map((item) => item.groupId)
          }
        ]
      : []
  })
  return {
    ...member,
    isOwn: viewerId === memberId,
    email: viewerId === memberId ? member.email : null,
    capabilities,
    ...buildAffiliations(memberships as never, [...holdings, ...legacyPositionSummaries])
  }
}

/** Other active Users, with literal name/username search and deterministic paging. */
export async function listMemberDirectory(
  database: MemberDatabase,
  viewerId: string,
  options: { query?: string; page?: number }
) {
  await requireActiveViewer(database, viewerId)
  const query = (options.query ?? "").trim().slice(0, 200)
  const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
  const filter = and(
    activeUser(),
    ne(user.id, viewerId),
    query ? or(ilike(user.name, pattern), ilike(user.username, pattern)) : undefined
  )
  const [total] = await database.select({ count: count() }).from(user).where(filter)
  const totalPages = Math.max(1, Math.ceil(total.count / DIRECTORY_PAGE_SIZE))
  const requestedPage = options.page ?? 1
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1
  const members = await database
    .select({ id: user.id, name: user.name, username: user.username, image: user.image })
    .from(user)
    .where(filter)
    .orderBy(asc(user.name), asc(user.username), asc(user.id))
    .limit(DIRECTORY_PAGE_SIZE)
    .offset((page - 1) * DIRECTORY_PAGE_SIZE)
  const ids = members.map((member) => member.id)
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())
  const [legacyMemberships, effectiveMemberships] = await Promise.all([
    listCurrentChoirAffiliationsOfUsers(database, ids),
    listEffectiveChoirAffiliationsOfUsersAt(database, ids, date)
  ])
  const memberships = [
    ...new Map(
      [...legacyMemberships, ...effectiveMemberships].map((membership) => [
        `${membership.userId}:${membership.groupId}`,
        membership
      ])
    ).values()
  ]
  return {
    query,
    page,
    totalPages,
    total: total.count,
    members: members.map((member) => ({
      ...member,
      choirs: memberships
        .filter((membership) => membership.userId === member.id && membership.type === "Choir")
        .map((choir) => ({
          id: choir.groupId,
          name: choir.name,
          section:
            memberships.find(
              (membership) =>
                membership.userId === member.id && membership.type === "Section" && membership.choirId === choir.groupId
            )?.name ?? null
        }))
    }))
  }
}
