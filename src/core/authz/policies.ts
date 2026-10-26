import { adminPolicies } from "./admin-policies"
import { groupPolicies } from "./group-policies"
import { memberPolicies } from "./member-policies"
import type {
  AuthorizationActor,
  AuthorizationPolicies,
  PermissionAction,
  PermissionContext,
  PermissionRequest
} from "./model"
import { postPolicies } from "./post-policies"

const policies: AuthorizationPolicies = {
  "app.access": () => true,
  "messaging.access": (actor) => actor.impersonatedBy === null,
  ...postPolicies,
  ...groupPolicies,
  ...memberPolicies,
  ...adminPolicies
}

// Keep the indexed policy and its context tied to the same action. Only the correlated
// PermissionRequest union reaches this helper; callers cannot pass independent union arguments.
function evaluateAction<Action extends PermissionAction>(
  actor: AuthorizationActor,
  action: Action,
  context: PermissionContext[Action]
): boolean {
  return policies[action](actor, context)
}

/**
 * Pure evaluation of trusted server attributes. Null means no active actor and always denies.
 * No I/O, caching or implicit Admin bypass. Runtime action names outside the registry deny too.
 * Application callers use core/authz's server entrypoint, which resolves the actor itself.
 */
export function evaluatePermission(actor: AuthorizationActor | null, request: PermissionRequest): boolean {
  if (!actor || !Object.hasOwn(policies, request.action)) return false
  return evaluateAction(actor, request.action, request.context)
}
