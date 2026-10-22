import "server-only"

import { and, eq, isNull, or } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import type { IsoDate } from "@/core/org-structure"
import { cskToday, listParticipationHistoryOfUser } from "@/features/org-structure-management"
import { type MemberDatabase, requireActiveViewer } from "../service"

/** A read-only organisation history for an active signed-in viewer; exposes no account or contact data. */
export async function getMemberCareer(
  database: MemberDatabase,
  viewerId: string,
  memberId: string,
  through: IsoDate = cskToday()
) {
  await requireActiveViewer(database, viewerId)
  const [person] = await database
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(and(eq(user.id, memberId), or(eq(user.banned, false), isNull(user.banned))))
    .limit(1)
  if (!person) return null
  const records = await listParticipationHistoryOfUser(database, memberId, through)
  return { person, isOwn: viewerId === memberId, through, records }
}
