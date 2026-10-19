import "server-only"

import { and, asc, count, eq, ilike, isNull, ne, or } from "drizzle-orm"
import type { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import {
  listCurrentChoirAffiliationsOfUsers,
  listCurrentGroupsOfUser,
  listCurrentPositionsOfUser
} from "@/features/org-structure"
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
export async function getMemberProfile(database: MemberDatabase, viewerId: string, memberId: string) {
  await requireActiveViewer(database, viewerId)
  const [member] = await database
    .select({ id: user.id, name: user.name, username: user.username, image: user.image, email: user.email })
    .from(user)
    .where(and(eq(user.id, memberId), activeUser()))
    .limit(1)
  if (!member) return null
  const [affiliations, capabilities] = await Promise.all([
    getCurrentAffiliations(database, memberId),
    listVoiceCapabilities(database, memberId)
  ])
  return {
    ...member,
    isOwn: viewerId === memberId,
    email: viewerId === memberId ? member.email : null,
    capabilities,
    ...affiliations
  }
}

/** Where a User sings today: their current Choirs, Sections, other groups and Positions. */
export async function getCurrentAffiliations(database: MemberDatabase, userId: string) {
  const [memberships, holdings] = await Promise.all([
    listCurrentGroupsOfUser(database, userId),
    listCurrentPositionsOfUser(database, userId)
  ])
  return buildAffiliations(memberships, holdings)
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
  const memberships = await listCurrentChoirAffiliationsOfUsers(
    database,
    members.map((member) => member.id)
  )
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
