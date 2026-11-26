import "server-only"

import type { PostAttributes, PostAudienceTarget } from "@/core/authz/model"
import { postPolicies } from "@/core/authz/post-policies"
import { env } from "@/core/config/env"
import { type ActivityTransaction, queueActivity, queuePublicActivity } from "@/core/realtime/outbox"
import { getPostRefreshFacts } from "@/features/org-structure"
import { hasAdminRole } from "@/shared/roles"

type Publication = { post: PostAttributes; targets: readonly PostAudienceTarget[] }

/** Queue one content-free refresh for each active reader of either version of a publication. */
export async function queuePostRefresh(tx: ActivityTransaction, ...publications: Publication[]) {
  if (!env.REDIS_URL) return
  const change = { kind: "posts.changed" } as const
  if (publications.some(({ post }) => post.audienceAll)) {
    await queuePublicActivity(tx, change)
    return
  }
  const { users, groups, memberships, positionAppointments, today } = await getPostRefreshFacts(tx)
  const membershipsByUser = Map.groupBy(memberships, ({ userId }) => userId)
  const appointmentsByUser = Map.groupBy(positionAppointments, ({ userId }) => userId)
  const recipients = users.filter(({ id, role }) => {
    const actor = { userId: id, isAdmin: hasAdminRole(role) }
    const relationships = {
      today,
      groups,
      memberships: membershipsByUser.get(id) ?? [],
      positionAppointments: appointmentsByUser.get(id) ?? []
    }
    return publications.some((publication) => postPolicies["post.read"](actor, { ...publication, relationships }))
  })
  await queueActivity(
    tx,
    recipients.map(({ id }) => id),
    change
  )
}
