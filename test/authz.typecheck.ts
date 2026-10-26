// Compile-only interface checks, included by bun run typecheck; never executed as application code.
import type { RequestAuthorization } from "@/core/authz/authorization"
import type {
  AuthorizationPolicies,
  AuthorizationPolicy,
  GroupAttributes,
  PermissionContext,
  PermissionRequest,
  PostAttributes
} from "@/core/authz/model"

function checkInterface(
  access: RequestAuthorization,
  post: PostAttributes,
  group: GroupAttributes,
  action: "post.update" | "member.read"
) {
  access.can({ action: "post.create" })
  access.requirePermission({ action: "post.update", context: { post } })
  access.can({ action: "group.manageContent", context: { group, memberships: [], positionHoldings: [] } })
  access.can({ action: "group.manageMemberships", context: { group } })

  // @ts-expect-error The Post context is required.
  access.can({ action: "post.update" })
  // @ts-expect-error IDs alone are no longer authorization context.
  access.requirePermission({ action: "post.update", postId: post.id })
  // @ts-expect-error Member facts cannot satisfy a Post action.
  access.can({ action: "post.update", context: { member: { id: "member", banned: false } } })
  // @ts-expect-error Group work requires relationship facts, even for a potential Admin actor.
  access.can({ action: "group.manageContent", context: { group } })
  // @ts-expect-error A permission boolean cannot substitute for resource and relationship facts.
  access.can({ action: "group.manageContent", context: { group, canManage: true } })
  // @ts-expect-error An actor cannot be supplied by the calling feature.
  access.can({ action: "post.create", actor: { userId: "forged", isAdmin: true, impersonatedBy: null } })
  // @ts-expect-error Context must remain correlated when the action itself is a union.
  access.can({ action, context: { post } })
  // @ts-expect-error Unsupported actions have no policy contract.
  access.can({ action: "post.destroy", context: { post } })
  // @ts-expect-error Context-free actions do not accept arbitrary extra facts.
  access.can({ action: "post.create", context: { post } })

  const policy: AuthorizationPolicy<"post.update"> = (_actor, context) => {
    const postContext: PermissionContext["post.update"] = context
    // @ts-expect-error Policy authors cannot access undeclared facts.
    postContext.member
    return postContext.post !== null
  }
  // @ts-expect-error Every declared action must have a policy.
  const missingPolicies: AuthorizationPolicies = { "post.update": policy }
  // @ts-expect-error A policy for the wrong action cannot be registered.
  const mismatchedPolicy: AuthorizationPolicies["member.read"] = policy
  // @ts-expect-error Even separately declared requests must correlate their action and context.
  const mismatchedRequest: PermissionRequest = { action: "post.read", context: { group } }

  return { missingPolicies, mismatchedPolicy, mismatchedRequest }
}

void checkInterface
