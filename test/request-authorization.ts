import { AuthorizationDeniedError } from "@/core/authz/authorization"
import type { PermissionRequest } from "@/core/authz/model"

/** Trusted session-boundary stub for transport tests; actual policies use PostgreSQL tests. */
export function requestAuthorization(
  read: () => Promise<{ user?: { id: string }; session?: { impersonatedBy?: string | null } } | null>
) {
  async function requirePermission(request: PermissionRequest) {
    const session = await read()
    if (!session) throw new AuthorizationDeniedError(request, null)
    const actor = {
      userId: session.user?.id ?? "sender",
      isAdmin: false,
      impersonatedBy: session.session?.impersonatedBy ?? null
    }
    if (request.action === "messaging.access" && actor.impersonatedBy)
      throw new AuthorizationDeniedError(request, actor)
    return actor
  }
  return { AuthorizationDeniedError, requirePermission }
}
