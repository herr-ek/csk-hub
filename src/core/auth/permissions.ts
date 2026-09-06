import { createAccessControl } from "better-auth/plugins/access"
import { defaultRoles, defaultStatements } from "better-auth/plugins/admin/access"
import { type AccessRole, ADMIN_ROLE, MEMBER_ROLE } from "@/shared/roles"

export type { AccessRole }
export { ADMIN_ROLE, MEMBER_ROLE }

// RESOURCES AND ACTIONS

/**
 * The resources this application owns, each mapped to the actions that can be taken on
 * it. Better Auth's `admin` plugin contributes `user` and `session`; everything under
 * `applicationStatements` is ours.
 *
 * Listing an action here does not grant it. It becomes reachable only once a role in
 * `accessRoles` is given it, and only where a call site asks for it.
 */
const applicationStatements = {
  post: ["read", "create"]
} as const

export const statements = {
  ...defaultStatements, // user, session, and their native actions
  ...applicationStatements // application resources
} as const

const accessControl = createAccessControl(statements)

// ROLES

/**
 * What each role may do. This table is where authorization decisions live: widening who
 * may publish a Post — to the board, to a gig group — is a change to the grants here,
 * never a role check bolted onto a feature.
 */
export const accessRoles = {
  [MEMBER_ROLE]: accessControl.newRole({
    ...defaultRoles.user.statements,
    post: ["read"]
  }),
  [ADMIN_ROLE]: accessControl.newRole({
    ...defaultRoles.admin.statements,
    post: ["read", "create"]
  })
} as const

export const DEFAULT_ROLE: AccessRole = MEMBER_ROLE

export const adminPluginOptions = {
  ac: accessControl,
  roles: accessRoles,
  defaultRole: DEFAULT_ROLE,
  adminRoles: ADMIN_ROLE
} as const

// PERMISSIONS

/**
 * The name of something that can be acted on — a key of `statements`, so `"post"`,
 * `"user"` or `"session"`.
 */
export type PermissionResource = keyof typeof statements

/**
 * One of the actions `Resource` declares in `statements`. For `"post"` that is
 * `"read" | "create"`; for `"session"`, `"list" | "revoke" | "delete"`.
 */
export type PermissionAction<Resource extends PermissionResource> = (typeof statements)[Resource][number]
