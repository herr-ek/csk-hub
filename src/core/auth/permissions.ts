import { createAccessControl } from "better-auth/plugins/access"
import { defaultRoles, defaultStatements } from "better-auth/plugins/admin/access"
import { type AccessRole, ADMIN_ROLE, USER_ROLE } from "@/shared/roles"

export type { AccessRole }
export { ADMIN_ROLE, USER_ROLE }

// RESOURCES AND ACTIONS

// Custom application permissions are disabled for now. Post writes use the admin guard.
// const applicationStatements = {
//   post: ["read", "create", "update"]
// } as const

export const statements = {
  ...defaultStatements // user, session, and their native actions
  // ...applicationStatements // application resources
} as const

const accessControl = createAccessControl(statements)

// ROLES

/**
 * Better Auth's native User/Session grants for each role. Resource-aware policies live in
 * core/authz; do not add Group/Position grants here. A migrating feature must replace its
 * existing read/write/UI checks together, not use these grants as an OR fallback.
 */
export const accessRoles = {
  [USER_ROLE]: accessControl.newRole({
    ...defaultRoles.user.statements
    // post: ["read"]
  }),
  [ADMIN_ROLE]: accessControl.newRole({
    ...defaultRoles.admin.statements
    // post: ["read", "create", "update"]
  })
} as const

export const DEFAULT_ROLE: AccessRole = USER_ROLE

export const adminPluginOptions = {
  ac: accessControl,
  roles: accessRoles,
  adminRoles: ADMIN_ROLE
} as const

// PERMISSIONS

/**
 * The name of something that can be acted on — currently `"user"` or `"session"`.
 */
export type PermissionResource = keyof typeof statements

/**
 * One of the actions `Resource` declares in `statements`; for `"session"`,
 * `"list" | "revoke" | "delete"`.
 */
export type PermissionAction<Resource extends PermissionResource> = (typeof statements)[Resource][number]
