import { getRequestSession } from "@/core/auth/session.server"
import { env } from "@/core/config/env"
import { ActivityConnection } from "./ActivityConnection"

export async function ActivitySubscription() {
  if (!env.REDIS_URL) return null
  const session = await getRequestSession()
  if (!session || session.session.impersonatedBy) return null
  return <ActivityConnection key={session.session.id} userId={session.user.id} />
}
